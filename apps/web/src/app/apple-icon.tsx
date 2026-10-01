import { ImageResponse } from "next/og";

// The brand mark as the home-screen icon: the five-bar autonomy scale on deep pine.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BARS = [0.22, 0.36, 0.5, 0.64, 0.88];

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 14, padding: "0 0 44px", background: "#0f766e" }}>
      {BARS.map((h, i) => (
        <div key={i} style={{ width: 17, height: 180 * h * 0.62, borderRadius: 9, background: i === 4 ? "#f0561f" : "#ffffff", opacity: i === 4 ? 1 : 0.4 + i * 0.18 }} />
      ))}
    </div>,
    size,
  );
}
