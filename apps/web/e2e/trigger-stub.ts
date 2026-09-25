/**
 * Test double for the Trigger.dev API. Accepts `tasks.trigger("agent-run", { runId })`
 * exactly as the SDK sends it and executes the same code the real agent-run task runs.
 * Only used by the Playwright suite (TRIGGER_API_URL points here).
 */
import { createServer } from "node:http";
import { executeRun, markRunFailed, RetryableRunError } from "@autonomos/agents";
import { createServiceClient, SupabaseRunStore } from "@autonomos/db";

const port = Number(process.env.TRIGGER_STUB_PORT ?? 3999);
const store = new SupabaseRunStore(createServiceClient());
let counter = 0;

async function runTask(runId: string, attempt = 1): Promise<void> {
  try {
    await executeRun(runId, store);
  } catch (e) {
    if (e instanceof RetryableRunError && attempt < 3) return runTask(runId, attempt + 1);
    await markRunFailed(runId, store, e instanceof Error ? e.message : String(e));
  }
}

createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const match = req.url?.match(/^\/api\/v1\/tasks\/([^/]+)\/trigger/);
  if (req.method === "POST" && match) {
    const parsed = JSON.parse(body || "{}");
    // The SDK sends superjson: { payload: "{\"json\":{...}}", options: { payloadType: "application/super+json" } }
    const decoded = typeof parsed.payload === "string" ? JSON.parse(parsed.payload) : parsed.payload;
    const payload = decoded?.json ?? decoded;
    const id = `run_stub_${++counter}`;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id }));
    if (decodeURIComponent(match[1]!) === "agent-run" && payload?.runId) setTimeout(() => void runTask(payload.runId), 50);
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: `stub does not implement ${req.method} ${req.url}` }));
}).listen(port, () => console.log(`trigger stub on ${port}`));
