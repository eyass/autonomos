import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./database.types";
export type DbClient = SupabaseClient<Database>;
export { SupabaseRunStore, sandboxStore, knowledgeSearch } from "./run-store";
export { sendNotification, type NotificationInput } from "./notify";

// Service-role client. Server-side only; bypasses RLS, so callers must scope by organization_id.
export function createServiceClient(): DbClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export * from "./services";
export { briefText, ingestSource, rebuildBrief, searchKnowledge, type IngestResult, type KnowledgeHit } from "./knowledge";
export { checkRecordWatches, connectionContext, recentRecordsFor, type WatchResult } from "./record-watch";
export { healConnections, healInventories, healRuns, healSchedules, takeInventory, INVENTORY_STALE_MS, type Enqueue, type HealReport, type ScheduleOps } from "./heal";
