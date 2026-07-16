import { appIconResponse } from "@/shared/lib/pwa/app-icon";

// Unlike icon.tsx/apple-icon.tsx, plain Route Handlers aren't statically
// optimized by default -- force it so this renders once at build time.
export const dynamic = "force-static";

export function GET() {
  return appIconResponse(192, 0.62);
}
