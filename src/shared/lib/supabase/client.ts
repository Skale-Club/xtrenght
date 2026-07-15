import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/shared/types/database.types";

/**
 * Supabase client for Client Components.
 *
 * Safe to call on every render: createBrowserClient memoises the underlying
 * instance, so this does not open a new connection each time.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
