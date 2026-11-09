import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** Shared renderer for code-generated Open Graph images (1200×630). */

export const ogSize = { width: 1200, height: 630 };

const fontDir = join(process.cwd(), "src/assets/fonts");
const [medium, extraBold, sponges, logo] = await Promise.all([
  readFile(join(fontDir, "PlusJakartaSans-500.woff")),
  readFile(join(fontDir, "PlusJakartaSans-800.woff")),
  readFile(join(process.cwd(), "src/assets/og-sponges.png")),
  readFile(join(process.cwd(), "src/assets/og-logo.png")),
]);
const spongesSrc = `data:image/png;base64,${sponges.toString("base64")}`;
const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

export function renderOg({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "linear-gradient(135deg, #e3f5e9 0%, #ffffff 60%)",
        padding: "64px 72px",
        fontFamily: "Jakarta",
        color: "#0e2a1f",
      }}
    >
      <div
        style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 32 }}
      >
        <div style={{ display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser */}
          <img src={logoSrc} width={105} height={90} alt="" />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{ fontSize: 26, fontWeight: 800, color: "#0f7a3c", textTransform: "uppercase", letterSpacing: 1 }}
          >
            {eyebrow}
          </span>
          <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginTop: 12 }}>
            {title}
          </span>
          <span style={{ fontSize: 28, fontWeight: 500, color: "#587063", marginTop: 20 }}>{subtitle}</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {["Free delivery", "Cash on Delivery", "Just add water"].map((t) => (
            <span
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                height: 52,
                fontSize: 22,
                lineHeight: 1,
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontWeight: 800,
                background: "#0e2a1f",
                color: "#fff",
                padding: "0 22px",
                borderRadius: 999,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser */}
        <img src={spongesSrc} width={420} height={420} alt="" />
      </div>
    </div>,
    {
      ...ogSize,
      fonts: [
        { name: "Jakarta", data: medium, weight: 500, style: "normal" },
        { name: "Jakarta", data: extraBold, weight: 800, style: "normal" },
      ],
    },
  );
}
