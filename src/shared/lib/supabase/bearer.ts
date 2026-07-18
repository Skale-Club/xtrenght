import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/types/database.types";

/**
 * Supabase client scoped to a bearer access token, for stateless API callers
 * (the MCP server) that authenticate per request instead of via a cookie.
 *
 * The token is pinned into the Authorization header of every PostgREST and Auth
 * request, so the row-level-security policies see the caller's identity and
 * decide what they may read and write -- exactly as they do for the browser.
 * That is the whole point: the MCP tools carry no authorization logic of their
 * own, because a second copy of the rule in TypeScript would be the weaker one.
 *
 * Session persistence and auto-refresh are off: there is no storage to persist
 * to on the server, and the token's lifetime is the caller's concern, not this
 * client's.
 */
export function createBearerClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * A client that carries no user identity, used only to exchange credentials for
 * tokens at the token endpoint. It talks to GoTrue with the publishable key and
 * never touches a user's data, so it needs neither cookies nor a bearer token.
 */
export function createAnonAuthClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
