import "server-only";
import { INVENTORY_STALE_MS, sendNotification, takeInventory as takeSharedInventory } from "@autonomos/db";
import { isInventory, type SystemInventory } from "@autonomos/integrations";
import { after } from "next/server";
import { adminDb } from "@/lib/session";

// The first inventory of a connected system (see packages/integrations/src/inventory.ts),
// taken once in the background when it is connected and stored on the connection. Readers
// and discovery use the stored copy; people can take it again from the Integrations page.

// A "running" inventory older than this was cut off and can be taken again.
export { INVENTORY_STALE_MS } from "@autonomos/db";

export async function takeInventory(organizationId: string, key: string, timeoutMs?: number): Promise<SystemInventory | null> {
  const db = adminDb();
  const inventory = await takeSharedInventory(db, organizationId, key, timeoutMs);
  if (!inventory) {
    const { data } = await db.from("integration_connections").select("inventory_status").eq("organization_id", organizationId).eq("integration_key", key).maybeSingle();
    if (data?.inventory_status === "failed") {
      await sendNotification(db, organizationId, {
        kind: "integration_error",
        title: `Could not map ${key}`,
        body: "AutonomOS could not list what this system holds. It tries again by itself within the hour.",
        link: "/integrations",
        // Once per system per day, however often the listing is retried.
        key: `inventory_failed:${key}:${new Date().toISOString().slice(0, 10)}`,
      }).catch((err) => console.error("notification failed", err));
    }
  }
  return inventory;
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
