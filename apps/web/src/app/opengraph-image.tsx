import { ImageResponse } from "next/og";

// The share card: the autonomy scale beside the promise, on the dark brand surface.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "AutonomOS: find the recurring work, deploy constrained AI agents";

const LEVELS = ["Manual", "Draft", "Approve", "Auto"];

export default function OpengraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0a1f1d", color: "#f5f3ee" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: "#0f4c47", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 6, paddingBottom: 16 }}>
          {[8, 13, 18, 23, 32].map((h, i) => (
            <div key={i} style={{ width: 6, height: h, borderRadius: 3, background: i === 4 ? "#f0561f" : "#ffffff", opacity: i === 4 ? 1 : 0.4 + i * 0.18 }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
          Autonom
          <span style={{ marginLeft: 6, padding: "3px 6px", borderRadius: 6, background: "#f0561f", color: "#ffffff", fontSize: 24, letterSpacing: 1 }}>OS</span>
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 900 }}>
        Automate the recurring work, with agents you can trust with real actions.
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        {LEVELS.map((name, i) => (
          <div key={name} style={{ display: "flex", flexDirection: "column", gap: 10, width: 200 }}>
            <div style={{ display: "flex", fontSize: 22, color: i === 3 ? "#f0561f" : "rgba(245,243,238,0.7)" }}>{name}</div>
            <div style={{ height: 14 + i * 18, borderRadius: 6, background: i === 3 ? "#f0561f" : "#ffffff", opacity: i === 3 ? 1 : 0.25 + i * 0.2 }} />
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
