import { beforeEach, describe, expect, it, vi } from "vitest";

// Live readers, with Composio replaced by a fake that answers like the real actions.
const calls: Array<{ slug: string; args: Record<string, unknown> }> = [];
let respond: (slug: string, args: Record<string, unknown>) => unknown = () => ({});
vi.mock("./providers", () => ({
  getComposio: () => ({
    tools: {
      execute: async (slug: string, o: { arguments: Record<string, unknown> }) => {
        calls.push({ slug, args: o.arguments });
        return { successful: true, data: respond(slug, o.arguments) };
      },
    },
  }),
}));
vi.mock("./directory", async (orig) => ({ ...(await orig<typeof import("./directory")>()), readOnlyTools: async () => [] }));

const { scanSystem } = await import("./scan");
const now = new Date("2026-09-26T12:00:00Z");
const ctx = (integration: string) => ({ organizationId: "org", connection: { integration, provider: "composio" as const, externalAccountId: "ca_1" }, sandbox: {} as never, now });
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

beforeEach(() => {
  calls.length = 0;
});

describe("live readers cover the whole lookback window", () => {
  it("Gmail samples every slice of the month and reports the total", async () => {
    respond = (_slug, args) => {
      const after = Number(String(args.query).match(/after:(\d+)/)![1]) * 1000;
      return {
        resultSizeEstimate: 300,
        messages: Array.from({ length: Number(args.max_results) }, (_, i) => ({ subject: `Invoice ${i}`, messageTimestamp: new Date(after + 3_600_000).toISOString() })),
      };
    };
    const scan = await scanSystem("gmail", ctx("gmail"));
    expect(calls).toHaveLength(5);
    expect(scan.sampled).toBe(250);
    expect(scan.periodDays).toBeGreaterThanOrEqual(29);
    expect(scan.estimatedTotal).toBe(1500);
  });
  it("Google Calendar reads every page of events, not one", async () => {
    respond = (_slug, args) =>
      args.pageToken
        ? { items: Array.from({ length: 40 }, (_, i) => ({ summary: `Standup ${i}`, start: { dateTime: daysAgo(20 + (i % 9)) }, recurringEventId: "r" })) }
        : { nextPageToken: "p2", items: Array.from({ length: 60 }, (_, i) => ({ summary: `Client call ${i}`, start: { dateTime: daysAgo(1 + (i % 18)) } })) };
    const scan = await scanSystem("googlecalendar", ctx("googlecalendar"));
    expect(calls.map((c) => c.slug)).toEqual(["GOOGLECALENDAR_EVENTS_LIST", "GOOGLECALENDAR_EVENTS_LIST"]);
    expect(calls[0]!.args).toMatchObject({ calendarId: "primary", singleEvents: true });
    expect(scan.sampled).toBe(100);
    expect(scan.periodDays).toBeGreaterThanOrEqual(28);
    expect(scan.stats.recurring).toBe(40);
  });
  it("Notion reads page titles from the title property", async () => {
    respond = () => ({ results: [{ object: "page", last_edited_time: daysAgo(3), properties: { Name: { type: "title", title: [{ plain_text: "Weekly supplier review" }] } } }], next_cursor: null });
    const scan = await scanSystem("notion", ctx("notion"));
    expect(scan.items[0]!.title).toBe("Weekly supplier review");
  });
  it("Google Drive samples every slice of the month", async () => {
    respond = (_slug, args) => ({ files: [{ name: "Timesheet", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: String(args.q).match(/modifiedTime <= '([^']+)'/)![1] }] });
    const scan = await scanSystem("google_drive", ctx("google_drive"));
    expect(calls).toHaveLength(5);
    expect(scan.sampled).toBe(5);
    expect(scan.periodDays).toBeGreaterThanOrEqual(24);
  });
});
