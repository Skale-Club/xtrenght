import { appIconResponse } from "@/shared/lib/pwa/app-icon";

export const dynamic = "force-static";

export function GET() {
  return appIconResponse(512, 0.42);
}
