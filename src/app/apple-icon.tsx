import { appIconResponse } from "@/shared/lib/pwa/app-icon";

// iOS renders its own rounded-square mask on top, so this stays a plain
// full-bleed square -- no need to pre-round the corners ourselves.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIconResponse(size.width, 0.62);
}
