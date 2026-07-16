import { appIconResponse } from "@/shared/lib/pwa/app-icon";

export const dynamic = "force-static";

// Maskable icons get cropped to a circle by some OS shells, so the glyph is
// kept well inside the ~80% safe zone instead of using the "any" ratio.
export function GET() {
  return appIconResponse(192, 0.42);
}
