import { classifyHttpStatus, ToolError, type ToolErrorCode } from "./errors";

// Self-healing building blocks. Temporary failures (a rate limit, a dropped connection, a busy
// upstream) are retried with backoff before anyone sees them; only what a retry cannot fix
// reaches a person, in plain words.

const TRANSIENT_TEXT: Array<[RegExp, ToolErrorCode]> = [
  [/rate.?limit|too many requests|\b429\b|quota exceeded|throttl/i, "rate_limited"],
  [/timed? ?out|timeout|deadline exceeded|\b408\b|\b504\b/i, "timeout"],
  [/ECONNRESET|ECONNREFUSED|EPIPE|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|network error|connection (reset|closed|refused)|other side closed/i, "network"],
  [/\b50[0-3]\b|service unavailable|bad gateway|internal server error|temporarily unavailable|overloaded|try again later/i, "upstream_unavailable"],
];
const AUTH_TEXT =
  /expired|revoked|invalid_grant|invalid[_ ]token|unauthori[sz]ed|\b401\b|re-?authori[sz]e|re-?authenticate|access token|refresh token|ConnectedAccountNotFound|connected account (not found|is not active)/i;

// What kind of failure this is, from a status code, an error name or its message.
export function classifyFailure(input: { status?: number | null; name?: string | null; message?: string | null }): ToolErrorCode {
  const text = `${input.name ?? ""} ${input.message ?? ""}`;
  if (/ConnectedAccountNotFound/i.test(text)) return "not_connected";
  if (typeof input.status === "number" && input.status > 0) {
    const byStatus = classifyHttpStatus(input.status);
    if (byStatus !== "invalid_data") return byStatus === "permission_denied" && AUTH_TEXT.test(text) ? "not_connected" : byStatus;
  }
  for (const [re, code] of TRANSIENT_TEXT) if (re.test(text)) return code;
  if (AUTH_TEXT.test(text)) return "not_connected";
  return "invalid_data";
}

const RETRYABLE: ToolErrorCode[] = ["timeout", "rate_limited", "upstream_unavailable", "network"];

// Whether a retry may fix this error. Covers ToolError, HTTP errors (status or statusCode),
// the AI SDK's own isRetryable flag, and network errors by message.
export function isTransient(error: unknown): boolean {
  if (error instanceof ToolError) return error.retryable;
  const e = error as { status?: number; statusCode?: number; isRetryable?: boolean; name?: string; message?: string; cause?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (typeof e.isRetryable === "boolean") return e.isRetryable;
  const code = classifyFailure({ status: e.status ?? e.statusCode, name: e.name, message: e.message });
  if (RETRYABLE.includes(code)) return true;
  return e.cause ? isTransient(e.cause) : false;
}

export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  const e = error as { status?: number; statusCode?: number; name?: string; message?: string } | null;
  const message = String(e?.message ?? error);
  return new ToolError(classifyFailure({ status: e?.status ?? e?.statusCode, name: e?.name, message }), message);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs fn, retrying temporary failures with exponential backoff and jitter. `when` narrows what
// counts as retryable for this call (e.g. only rate limits for an action that changes things).
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: { attempts?: number; baseMs?: number; when?: (error: unknown) => boolean } = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseMs ?? 500;
  const when = opts.when ?? isTransient;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= attempts || !when(e)) throw e;
      await sleep(base * 3 ** (attempt - 1) * (0.75 + Math.random() * 0.5));
    }
  }
}

// A rate limit means the request was refused before it ran, so even an action that changes
// something can be retried safely; other temporary failures may have reached the system.
export const safeToRetryWrite = (error: unknown) =>
  error instanceof ToolError ? error.code === "rate_limited" : classifyFailure({ message: String((error as Error)?.message ?? error) }) === "rate_limited";
