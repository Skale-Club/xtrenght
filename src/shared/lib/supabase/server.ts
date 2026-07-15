import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/shared/types/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Must be created per request -- it closes over that request's cookie store, so
 * a module-level singleton would serve one user's session to everybody.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies. Ignoring is safe because
            // src/proxy.ts refreshes the session on every matched request.
          }
        },
      },
    },
  );
}
