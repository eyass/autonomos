"use client";
import { useEffect } from "react";

// The last safety net, for a failure in the root layout itself. It reloads once by itself (that
// fixes a deploy mid-session and most passing failures); a failure that survives says so plainly.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
    try {
      const key = "autonomos:global-reload";
      if (Date.now() - Number(window.sessionStorage.getItem(key) ?? 0) < 60_000) return;
      window.sessionStorage.setItem(key, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f6f5f1", color: "#16211d" }}>
        <main role="alert" style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>AutonomOS could not load</h1>
          <p style={{ fontSize: 14, color: "#5b6661" }}>It tried again by itself and it still failed. Nothing you saved is lost.</p>
          {error.digest ? <p style={{ fontSize: 12, color: "#5b6661", fontFamily: "monospace" }}>Reference {error.digest}</p> : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: 0, background: "#0f766e", color: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
