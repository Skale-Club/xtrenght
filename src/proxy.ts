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
     * Every path except static assets, image files, and the PWA surface
     * (manifest, generated icons, service worker). Those must serve
     * identically whether or not there's a session -- redirecting them to
     * /login would hand the browser HTML where it expects JSON/PNG/JS, and
     * would make the service worker's cache.addAll() throw on install
     * (caching a redirected response is disallowed).
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|manifest-icons/|icon$|apple-icon$|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
