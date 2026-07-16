import { appIconResponse } from "@/shared/lib/pwa/app-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return appIconResponse(size.width, 0.62);
}
