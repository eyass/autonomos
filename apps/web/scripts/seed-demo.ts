/**
 * Seeds a demo organisation for the 10-minute demo (PRD section 128):
 * a signed-up owner, departments, reviewed processes, sandbox Zendesk/Stripe/Slack,
 * and the approved Refund Agent opportunity, ready for "Create agent" (demo minute 6).
 * No agent runs or metrics are fabricated; dashboard numbers come from real runs.
 *
 *   pnpm db:seed:demo            (uses DEMO_EMAIL / DEMO_PASSWORD or the defaults below)
 */
import { createServiceClient } from "@autonomos/db";
import { seedDemoOrganization } from "../src/server/demo-seed";

const email = process.env.DEMO_EMAIL ?? "demo@autonomos.local";
const password = process.env.DEMO_PASSWORD ?? "autonomos-demo";
const db = createServiceClient();

async function main() {
  // 1. Owner account (email confirmed so the demo can sign in immediately).
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: "Demo", last_name: "Owner" } });
    if (error || !data.user) throw error ?? new Error("could not create user");
    user = data.user;
  }
  const { data: existing } = await db.from("organization_members").select("organization_id").eq("user_id", user.id);
  if (existing?.length) {
    console.log(`Demo user ${email} already has an organisation; nothing to do.`);
    return;
  }

  const { opportunityId } = await seedDemoOrganization(db, user.id);
  console.log(`Seeded "Northwind Marketplace" for ${email} (password: ${password === "autonomos-demo" ? password : "from DEMO_PASSWORD"}).`);
  console.log(`Next: sign in, open Opportunities → Refund Agent → Create agent (opportunity ${opportunityId}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
