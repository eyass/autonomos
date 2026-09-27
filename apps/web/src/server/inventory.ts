import "server-only";
import { sandboxStore, sendNotification, type TablesUpdate } from "@autonomos/db";
import { inventorySystem, isInventory, type SystemInventory } from "@autonomos/integrations";
import { after } from "next/server";
import { adminDb } from "@/lib/session";

// The first inventory of a connected system (see packages/integrations/src/inventory.ts),
// taken once in the background when it is connected and stored on the connection. Readers
// and discovery use the stored copy; people can take it again from the Integrations page.

const TIMEOUT_MS = 4 * 60_000;
// A "running" inventory older than this was cut off and can be taken again.
export const INVENTORY_STALE_MS = 6 * 60_000;

export async function takeInventory(organizationId: string, key: string, timeoutMs = TIMEOUT_MS): Promise<SystemInventory | null> {
  const db = adminDb();
  const { data: c } = await db.from("integration_connections").select("provider, external_account_id, status").eq("organization_id", organizationId).eq("integration_key", key).maybeSingle();
  if (!c || c.status !== "connected") return null;
  const save = (fields: TablesUpdate<"integration_connections">) => db.from("integration_connections").update(fields).eq("organization_id", organizationId).eq("integration_key", key);
  await save({ inventory_status: "running", inventory_error: null, inventoried_at: new Date().toISOString() });
  try {
    const inventory = await Promise.race([
      inventorySystem(key, {
        organizationId,
        connection: { integration: key, provider: c.provider as "sandbox" | "composio", externalAccountId: c.external_account_id },
        sandbox: sandboxStore(db, organizationId),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Listing took too long")), timeoutMs)),
    ]);
    await save({ inventory: inventory as never, inventory_status: "ready", inventoried_at: inventory.takenAt, inventory_error: null });
    return inventory;
  } catch (e) {
    console.error("inventory failed", key, e);
    await save({ inventory_status: "failed", inventory_error: e instanceof Error ? e.message.slice(0, 300) : "failed" });
    await sendNotification(db, organizationId, {
      kind: "integration_error",
      title: `Could not map ${key}`,
      body: "AutonomOS could not list what this system holds. Check the connection, then choose Map again.",
      link: "/integrations",
      // Once per system per day, however often the listing is retried.
      key: `inventory_failed:${key}:${new Date().toISOString().slice(0, 10)}`,
    }).catch((err) => console.error("notification failed", err));
    return null;
  }
}

// After the response, so connecting returns straight away.
export function inventoryInBackground(organizationId: string, key: string) {
  after(() => takeInventory(organizationId, key).then(() => undefined));
}

// The stored inventory, or one taken now (with a shorter budget, as part of a read) for a
// system connected before inventories existed. While one is being taken in the background,
// readers go ahead without it.
export async function inventoryFor(organizationId: string, key: string, stored: unknown): Promise<SystemInventory | null> {
  if (isInventory(stored)) return stored;
  const { data } = await adminDb().from("integration_connections").select("inventory_status, inventoried_at").eq("organization_id", organizationId).eq("integration_key", key).maybeSingle();
  const busy = data?.inventory_status === "running" && data.inventoried_at && Date.now() - new Date(data.inventoried_at).getTime() < INVENTORY_STALE_MS;
  return busy ? null : takeInventory(organizationId, key, 90_000);
}
