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

// A small public-looking company website for the onboarding crawl (see CRAWL_ALLOW_PRIVATE).
const SITE: Record<string, string> = {
  "/site": `<!doctype html><html lang="en"><head><title>Acme Furniture | Second-hand furniture marketplace</title>
    <meta name="description" content="Acme Furniture is a marketplace where people buy and sell second-hand furniture from independent sellers.">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme Furniture","address":{"@type":"PostalAddress","addressCountry":"NL"},"numberOfEmployees":{"@type":"QuantitativeValue","value":35}}</script>
    <script src="https://static.zdassets.com/ekr/snippet.js?key=demo"></script></head>
    <body><nav><a href="/site/about">About us</a><a href="/site/pricing">Pricing for sellers</a><a href="/site/careers">Careers</a><a href="/site/help">Help centre</a><a href="/site/privacy">Privacy</a></nav>
    <main><h1>Furniture that deserves a second life</h1><p>Buy and sell used sofas, tables and chairs. Buyers pay safely through Acme and sellers get paid after delivery.</p></main></body></html>`,
  "/site/about": `<html><head><title>About Acme Furniture</title></head><body><main><p>We are 35 people in Amsterdam building the largest marketplace for second-hand furniture in the Benelux.</p></main></body></html>`,
  "/site/pricing": `<html><head><title>Pricing</title><script src="https://js.stripe.com/v3"></script></head><body><main><p>Sellers pay 8% per sale. Buyer protection and refunds are included.</p></main></body></html>`,
  "/site/careers": `<html><head><title>Careers</title></head><body><main><p>Customer support agent (Dutch speaking). Help buyers and sellers with orders, refunds and listings.</p></main></body></html>`,
  "/site/help": `<html><head><title>Help centre</title></head><body><main><p>Questions about an order or a refund? Contact our support team.</p></main></body></html>`,
};

createServer(async (req, res) => {
  const page = SITE[(req.url ?? "").split("?")[0]!.replace(/\/$/, "")];
  if (req.method === "GET" && page) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }
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
