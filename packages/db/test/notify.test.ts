import { describe, expect, it } from "vitest";
import { sendNotification } from "../src";
import { service, signUp, uniqueEmail } from "./helpers";

// A failure or hand-off is notified once, however many times the job that reports it runs.
describe("notifications", () => {
  it("sends one notification per event key", async () => {
    const owner = await signUp(uniqueEmail("notify"));
    const { data: orgId } = await owner.client.rpc("create_organization", { p_name: "Notify Org", p_website: "", p_industry: "", p_employee_count: "", p_country: "", p_description: "" });
    const db = service();
    const n = { kind: "agent_failed" as const, title: "Agent failed", body: "x", link: "/activity/1", key: "agent_failed:/activity/1" };
    expect(await sendNotification(db, orgId!, n)).toBe(true);
    expect(await sendNotification(db, orgId!, n)).toBe(false);
    expect(await sendNotification(db, orgId!, { ...n, key: "agent_failed:/activity/2" })).toBe(true);
    // Without a key every call is its own notification.
    await sendNotification(db, orgId!, { ...n, key: undefined });
    await sendNotification(db, orgId!, { ...n, key: undefined });
    const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("organization_id", orgId!);
    expect(count).toBe(4);
  });
});
