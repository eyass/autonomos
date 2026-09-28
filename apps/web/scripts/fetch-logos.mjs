// Downloads the SaaS logos the public site shows into public/logos, once, so pages never call
// logo.dev at runtime. Run from apps/web with LOGO_DEV_SECRET_KEY set (it lives in .env.local):
//   node --env-file=../../.env.local scripts/fetch-logos.mjs
// The secret key is used only for logo.dev's search API, which returns image links carrying the
// account's publishable key; neither key is written anywhere.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// logo.dev holds company marks, not product marks: Gmail, Calendar and Drive all resolve to
// Google, Jira to Atlassian and QuickBooks to Intuit, so those are shown by company.
const LOGOS = {
  google: "google.com",
  outlook: "outlook.com",
  slack: "slack.com",
  hubspot: "hubspot.com",
  salesforce: "salesforce.com",
  stripe: "stripe.com",
  zendesk: "zendesk.com",
  intercom: "intercom.com",
  notion: "notion.so",
  atlassian: "atlassian.com",
  asana: "asana.com",
  shopify: "shopify.com",
  intuit: "intuit.com",
  xero: "xero.com",
  airtable: "airtable.com",
  mailchimp: "mailchimp.com",
  docusign: "docusign.com",
  linear: "linear.app",
};

const key = process.env.LOGO_DEV_SECRET_KEY;
if (!key) throw new Error("Set LOGO_DEV_SECRET_KEY");
const res = await fetch("https://api.logo.dev/search?q=stripe", { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) throw new Error(`logo.dev search ${res.status}`);
const token = new URL((await res.json())[0].logo_url).searchParams.get("token");
const out = join(import.meta.dirname, "..", "public", "logos");
await mkdir(out, { recursive: true });
for (const [slug, domain] of Object.entries(LOGOS)) {
  const img = await fetch(`https://img.logo.dev/${domain}?token=${token}&size=128&format=png&retina=true`);
  if (!img.ok) {
    console.error(`${slug}: ${img.status}`);
    continue;
  }
  await writeFile(join(out, `${slug}.png`), Buffer.from(await img.arrayBuffer()));
  console.log(`${slug} <- ${domain}`);
}
