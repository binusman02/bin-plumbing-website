import { ImageResponse } from "next/og";

export const alt = "FlowGuard Plumbing Enterprises — Coordinated Plumbing Services";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#07152B",
          color: "#FFFFFF",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "9999px",
              backgroundColor: "#F5B301",
            }}
          />
          <span
            style={{
              fontSize: "24px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#F5B301",
              textTransform: "uppercase",
            }}
          >
            FlowGuard Plumbing Enterprises
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "920px" }}>
          <div style={{ fontSize: "60px", fontWeight: 800, lineHeight: 1.1 }}>
            Reliable Plumbing Services, Coordinated Clearly.
          </div>
          <div style={{ fontSize: "26px", color: "#C9D3E0", lineHeight: 1.4 }}>
            On-site inspection • Itemised quotations • Customer approval before work • Live reference tracking
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.16)",
            paddingTop: "24px",
            fontSize: "20px",
            color: "#A8B6C8",
          }}
        >
          <span>Residential & Commercial Plumbing</span>
          <span style={{ color: "#F5B301", fontWeight: 700 }}>flowgarud.vercel.app</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
