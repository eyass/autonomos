// PRD section 82: tool errors are classified as retryable or not.
export type ToolErrorCode =
  | "timeout"
  | "rate_limited"
  | "upstream_unavailable"
  | "network"
  | "permission_denied"
  | "invalid_data"
  | "not_found"
  | "policy_violation"
  | "not_connected"
  | "rejected";

const RETRYABLE: ToolErrorCode[] = ["timeout", "rate_limited", "upstream_unavailable", "network"];

export class ToolError extends Error {
  readonly retryable: boolean;
  constructor(readonly code: ToolErrorCode, message: string) {
    super(message);
    this.name = "ToolError";
    this.retryable = RETRYABLE.includes(code);
  }
}

export function classifyHttpStatus(status: number): ToolErrorCode {
  if (status === 401 || status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_unavailable";
  return "invalid_data";
}
