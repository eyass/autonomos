import { INTEGRATION_EVENTS } from "@autonomos/schemas";

// What "tested" and "equipped" mean before an agent may go live. Pure functions, so the
// rules are the same wherever they are checked and are covered by unit tests.

export type TestRunSummary = {
  status: string;
  outcome: string | null;
  success: boolean | null;
  input: unknown;
  versionId: string | null;
  summary: string | null;
};

// The sample-input text the test panel offers, which describes a record rather than being one.
const PLACEHOLDERS = [/^a typical request for /i, /^add the facts/i, /^describe the record/i, /^the run covers this period/i];

// An input with at least one real value: a sample record, not `{}` or placeholders only.
export function hasData(input: unknown): boolean {
  if (input === null || input === undefined) return false;
  if (typeof input === "string") return input.trim().length > 0 && !PLACEHOLDERS.some((p) => p.test(input.trim()));
  if (typeof input === "number" || typeof input === "boolean") return true;
  if (Array.isArray(input)) return input.some(hasData);
  if (typeof input === "object") return Object.values(input as Record<string, unknown>).some(hasData);
  return false;
}

// A passed test: it finished, it succeeded, it was not handed to a person, and it ran on real input.
export function isPassedTest(r: TestRunSummary): boolean {
  return r.status === "completed" && r.success === true && (r.outcome === "test_passed" || r.outcome === "test_completed") && hasData(r.input);
}

export function describeTest(r: TestRunSummary): string {
  if (r.status === "failed") return "failed";
  if (r.status === "queued" || r.status === "running" || r.status === "waiting_for_approval") return "still running";
  if (r.outcome === "escalated") return "was handed to a person";
  if (!hasData(r.input)) return "ran on an empty input";
  if (r.success !== true || r.outcome === "test_unsuccessful") return "did not pass";
  return "passed";
}

// Tests on the current configuration only, newest first. The newest one decides: an agent
// whose last test failed or escalated is not ready, whatever passed before.
export function testGate(runs: TestRunSummary[], currentVersionId: string | null): { ok: boolean; detail: string } {
  const current = currentVersionId ? runs.filter((r) => r.versionId === currentVersionId) : runs;
  const latest = current[0];
  if (!latest) return { ok: false, detail: runs.length ? "The configuration changed since the last test. Test this version with a sample record." : "Run a test with a sample record first." };
  if (isPassedTest(latest)) return { ok: true, detail: "The latest test on this version passed, on a sample record." };
  const what = describeTest(latest);
  const hint =
    what === "was handed to a person"
      ? `${latest.summary ? `Reason: ${latest.summary}. ` : ""}Fix what it needed, then test again.`
      : what === "ran on an empty input"
        ? "Give it a sample record (Use sample input) and test again."
        : what === "still running"
          ? "Wait for it to finish."
          : "Open the run to see why, then test again.";
  return { ok: false, detail: `The latest test ${what}. ${hint}` };
}

export type ToolInfo = { key: string; access: "read" | "write"; integration: string };

// The agent must be able to see the work: at least one tool that reads a real system, and,
// when a system's event starts it, a tool of that same system to read the record it is about.
export function toolGate(tools: ToolInfo[], trigger: { type: string; event?: string }): { ok: boolean; detail: string } {
  const reads = tools.filter((t) => t.access === "read" && t.integration !== "knowledge");
  if (!reads.length) return { ok: false, detail: "It has no tool that reads data, so it would work blind. Add a read tool for the system the work lives in." };
  if (trigger.type === "integration_event") {
    const source = INTEGRATION_EVENTS.find((e) => e.key === trigger.event)?.integration ?? trigger.event?.split(".")[0];
    if (source && !tools.some((t) => t.integration === source)) {
      return { ok: false, detail: `It starts on a ${source} event but has no ${source} tool to read that record. Add one, or change the trigger.` };
    }
  }
  return { ok: true, detail: `Reads from ${[...new Set(reads.map((t) => t.integration))].join(", ")}.` };
}
