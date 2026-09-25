import "server-only";
import { HttpError } from "./session";

// Basic fixed-window limiter per key (PRD section 71). Per server instance; put a shared
// store (e.g. Upstash) behind the same function when running many instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new HttpError(429, "Too many requests, slow down and try again shortly");
}
