import { describe, expect, it } from "vitest";
import { service, signUp, uniqueEmail } from "./helpers";

// Tenant isolation is enforced by the database, not only by application code (PRD section 59).
describe("row level security", () => {
  it("isolates organisations and blocks client-side approval resolution", async () => {
    const a = await signUp(uniqueEmail("owner-a"));
    const b = await signUp(uniqueEmail("owner-b"));
    const { data: orgA, error } = await a.client.rpc("create_organization", { p_name: "Org A", p_website: "", p_industry: "SaaS", p_employee_count: "20–49", p_country: "", p_description: "" });
    expect(error).toBeNull();
    await b.client.rpc("create_organization", { p_name: "Org B", p_website: "", p_industry: "", p_employee_count: "", p_country: "", p_description: "" });

    const { error: insertError } = await a.client.from("processes").insert({ organization_id: orgA!, title: "Secret process" });
    expect(insertError).toBeNull();

    // B cannot read A's organisation or processes.
    const { data: orgsSeenByB } = await b.client.from("organizations").select("id, name");
    expect(orgsSeenByB?.map((o) => o.name)).toEqual(["Org B"]);
    const { data: procsSeenByB } = await b.client.from("processes").select("id").eq("organization_id", orgA!);
    expect(procsSeenByB).toEqual([]);

    // B cannot write into A's organisation.
    const { error: crossWrite } = await b.client.from("processes").insert({ organization_id: orgA!, title: "Injected" });
    expect(crossWrite).not.toBeNull();

    // Members cannot write runtime tables directly (approvals, runs, activity).
    const { error: approvalWrite } = await a.client.from("approval_requests").update({ status: "approved" }).eq("organization_id", orgA!);
    const { data: stillPending } = await a.client.from("approval_requests").select("id").eq("status", "approved");
    expect(approvalWrite === null ? stillPending : []).toEqual([]);
    const { error: activityWrite } = await a.client.from("activity_events").insert({ organization_id: orgA!, actor_type: "user", action_type: "x", title: "forged" });
    expect(activityWrite).not.toBeNull();

    // Webhook secrets are never readable by users.
    const { data: secrets } = await a.client.from("integration_secrets").select("*");
    expect(secrets ?? []).toEqual([]);

    // Audit is append-only, even for the owner.
    const { data: audit } = await a.client.from("audit_events").select("id").eq("organization_id", orgA!).limit(1);
    expect(audit?.length).toBe(1);
    const { error: auditDelete } = await a.client.from("audit_events").delete().eq("id", audit![0]!.id);
    const { data: auditAfter } = await a.client.from("audit_events").select("id").eq("id", audit![0]!.id);
    expect(auditDelete !== null || auditAfter?.length === 1).toBe(true);
  });

  it("shows people published playbooks only, and lets no one write them from the client", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const { data: rows } = await service()
      .from("playbooks")
      .insert([
        { slug: `rls-draft-${tag}`, title: `Draft ${tag}`, status: "draft" },
        { slug: `rls-live-${tag}`, title: `Live ${tag}`, status: "published" },
      ])
      .select("id, status");
    const a = await signUp(uniqueEmail("playbooks"));
    const { data: seen } = await a.client.from("playbooks").select("title").like("slug", `rls-%-${tag}`);
    expect(seen?.map((r) => r.title)).toEqual([`Live ${tag}`]);
    const { error: insert } = await a.client.from("playbooks").insert({ slug: `rls-forged-${tag}`, title: "Forged", status: "published" });
    expect(insert).not.toBeNull();
    await a.client.from("playbooks").update({ title: "Changed" }).like("slug", `rls-%-${tag}`);
    const { data: after } = await service().from("playbooks").select("title").like("slug", `rls-%-${tag}`).order("title");
    expect(after?.map((r) => r.title)).toEqual([`Draft ${tag}`, `Live ${tag}`]);
    await service()
      .from("playbooks")
      .delete()
      .in(
        "id",
        (rows ?? []).map((r) => r.id),
      );
  });
});
