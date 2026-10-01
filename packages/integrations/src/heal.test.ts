import { describe, expect, it } from "vitest";
import { ToolError } from "./errors";
import { classifyFailure, isTransient, safeToRetryWrite, withRetry } from "./heal";

describe("self-healing building blocks", () => {
  it("tells temporary failures from ones a retry cannot fix", () => {
    expect(classifyFailure({ message: "429 Too Many Requests" })).toBe("rate_limited");
    expect(classifyFailure({ message: "fetch failed: ECONNRESET" })).toBe("network");
    expect(classifyFailure({ status: 503, message: "Service Unavailable" })).toBe("upstream_unavailable");
    expect(classifyFailure({ message: "The access token expired" })).toBe("not_connected");
    expect(classifyFailure({ status: 403, message: "Forbidden: missing scope" })).toBe("permission_denied");
    expect(classifyFailure({ message: "Validation failed" })).toBe("invalid_data");
    expect(isTransient(new ToolError("timeout", "slow"))).toBe(true);
    expect(isTransient({ isRetryable: false, message: "429" })).toBe(false);
    expect(isTransient({ status: 502 })).toBe(true);
    expect(isTransient(new Error("Validation failed"))).toBe(false);
  });

  it("retries temporary failures and gives up on the rest", async () => {
    let calls = 0;
    await expect(withRetry(async () => (++calls < 3 ? Promise.reject(new ToolError("network", "reset")) : "ok"), { baseMs: 1 })).resolves.toBe("ok");
    expect(calls).toBe(3);
    calls = 0;
    await expect(withRetry(async () => (++calls, Promise.reject(new ToolError("invalid_data", "bad"))), { baseMs: 1 })).rejects.toThrow("bad");
    expect(calls).toBe(1);
  });

  it("retries an action that changes something only when it was refused before it ran", () => {
    expect(safeToRetryWrite(new ToolError("rate_limited", "429"))).toBe(true);
    expect(safeToRetryWrite(new ToolError("upstream_unavailable", "502"))).toBe(false);
  });
});
