import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminDb, HttpError, requireSessionOrThrow, sessionFor, type Session } from "./session";

const KEY_PREFIX = "aos_live_";

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

// A new key: shown once, stored only as a hash. The prefix identifies it in lists.
export function generateApiKey() {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 6), hash: hashApiKey(key) };
}

// Route handlers accept either the browser session or `Authorization: Bearer aos_live_...`.
// A key acts as the member who created it, with that member's current role, so removing
// the member or lowering their role also limits the key.
export async function requireApiSession(request: Request): Promise<Session> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return requireSessionOrThrow();
  const key = header.slice("Bearer ".length).trim();
  if (!key.startsWith(KEY_PREFIX)) throw new HttpError(401, "Invalid API key");
  const db = adminDb();
  const { data: row } = await db.from("api_keys").select("id, organization_id, created_by, revoked_at, scope").eq("key_hash", hashApiKey(key)).maybeSingle();
  if (!row || row.revoked_at) throw new HttpError(401, "Invalid or revoked API key");
  // A read-only key can list and fetch, never change anything.
  if (row.scope === "read" && !["GET", "HEAD"].includes(request.method)) throw new HttpError(403, "This API key is read-only");
  const session = await sessionFor(row.created_by, row.organization_id);
  if (!session) throw new HttpError(401, "The member who created this API key is no longer in the organisation");
  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return { ...session, apiKeyId: row.id };
}
