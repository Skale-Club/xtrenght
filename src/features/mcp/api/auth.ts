import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createBearerClient } from "@/shared/lib/supabase/bearer";
import type { Database } from "@/shared/types/database.types";

/**
 * Turns the Authorization header of an MCP request into an authenticated,
 * RLS-scoped Supabase client.
 *
 * The bearer credential is a Supabase access token (a JWT). It is validated
 * with getUser(token), which revalidates it against the Auth server rather than
 * merely decoding it -- the same rule the rest of this app follows, because a
 * decoded-but-unverified token is not evidence of anything. When it checks out,
 * the returned client carries that token on every request, so PostgREST applies
 * the caller's row-level-security policies to whatever the tools do.
 */

export type AuthResult =
  | { ok: true; supabase: SupabaseClient<Database>; user: User }
  | { ok: false; status: 401; error: string };

export function extractBearer(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1].trim() : null;
}

export async function authenticate(authorization: string | null): Promise<AuthResult> {
  const token = extractBearer(authorization);
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token. Send 'Authorization: Bearer <access token>'." };
  }

  const supabase = createBearerClient(token);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { ok: false, status: 401, error: "The access token is invalid or has expired." };
  }

  return { ok: true, supabase, user: data.user };
}
