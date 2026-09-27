import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "../src/database.types";
import { service, signUp, uniqueEmail } from "./helpers";

// Secrets and keys are server-only: neither an anonymous visitor nor a signed-in member,
// including the owner of the organisation they belong to, can read or change them through
// the public API. The server reads them with the service role after its own checks.
describe("secret handling", () => {
  it("keeps webhook secrets and API key hashes out of reach of every client", async () => {
    const owner = await signUp(uniqueEmail("secrets-owner"));
    const other = await signUp(uniqueEmail("secrets-other"));
    const { data: orgId, error } = await owner.client.rpc("create_organization", { p_name: "Secret Org", p_website: "", p_industry: "", p_employee_count: "", p_country: "", p_description: "" });
    expect(error).toBeNull();
    await other.client.rpc("create_organization", { p_name: "Other Org", p_website: "", p_industry: "", p_employee_count: "", p_country: "", p_description: "" });

    // Server-side setup: a connection with a webhook secret, and an API key.
    const db = service();
    const { data: connection, error: connError } = await db.from("integration_connections").insert({ organization_id: orgId!, integration_key: "zendesk", provider: "sandbox" }).select("id").single();
    expect(connError).toBeNull();
    const { error: secretError } = await db.from("integration_secrets").insert({ connection_id: connection!.id, organization_id: orgId! });
    expect(secretError).toBeNull();
    const { error: keyError } = await db.from("api_keys").insert({ organization_id: orgId!, name: "CI", prefix: "aos_live_abcdef", key_hash: `hash-${Date.now()}`, created_by: owner.userId });
    expect(keyError).toBeNull();

    const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

    for (const [who, client] of [
      ["anonymous", anon],
      ["owner", owner.client],
      ["other organisation", other.client],
    ] as const) {
      // Webhook secrets: no rows, whoever asks.
      const { data: secrets } = await client.from("integration_secrets").select("*");
      expect(secrets ?? [], `${who} reads integration_secrets`).toEqual([]);
      const { data: oneSecret } = await client.from("integration_secrets").select("webhook_secret").eq("connection_id", connection!.id);
      expect(oneSecret ?? [], `${who} reads one secret`).toEqual([]);
      // API keys: not even the hash.
      const { data: keys } = await client.from("api_keys").select("key_hash").eq("organization_id", orgId!);
      expect(keys ?? [], `${who} reads api_keys`).toEqual([]);
      // Nor can they be written.
      const { error: forgeKey } = await client.from("api_keys").insert({ organization_id: orgId!, name: "forged", prefix: "x", key_hash: `forged-${who}`, created_by: owner.userId });
      expect(forgeKey, `${who} inserts an api key`).not.toBeNull();
      await client.from("integration_secrets").update({ webhook_secret: "attacker" }).eq("connection_id", connection!.id);
    }

    // Anonymous visitors see no tenant data at all.
    for (const table of ["organizations", "processes", "integration_connections", "discovery_sessions", "agents"] as const) {
      const { data } = await anon.from(table).select("id").limit(1);
      expect(data ?? [], `anonymous reads ${table}`).toEqual([]);
    }
    // Another organisation cannot see the connection either.
    const { data: foreign } = await other.client.from("integration_connections").select("id").eq("organization_id", orgId!);
    expect(foreign).toEqual([]);

    // Nothing above changed the secret, and no forged key exists.
    const { data: stored } = await db.from("integration_secrets").select("webhook_secret").eq("connection_id", connection!.id).single();
    expect(stored!.webhook_secret).not.toBe("attacker");
    const { count } = await db.from("api_keys").select("id", { count: "exact", head: true }).eq("organization_id", orgId!);
    expect(count).toBe(1);
  });
});
