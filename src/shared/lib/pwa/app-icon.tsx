import { ImageResponse } from "next/og";

const BACKGROUND = "#08090b";
const ACCENT = "#d7ff3e";

// Shared by icon.tsx, apple-icon.tsx, and the manifest-icons routes so the
// mark stays identical everywhere instead of drifting between hand-tuned copies.
export function appIconResponse(size: number, glyphRatio: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BACKGROUND,
          fontSize: Math.round(size * glyphRatio),
          fontWeight: 700,
          color: ACCENT,
        }}
      >
        X
      </div>
    ),
    { width: size, height: size },
  );
}
