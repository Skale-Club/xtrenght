import type { NextRequest } from "next/server";

import { updateSession } from "@/shared/lib/supabase/proxy";

// Next.js 16 renamed middleware.ts to proxy.ts and the exported `middleware`
// function to `proxy`. The runtime is Node and is not configurable.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image files. Auth cookies must be
     * refreshed on navigations, not on asset fetches.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
