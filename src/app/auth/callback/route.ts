import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/shared/lib/supabase/server";

/**
 * OAuth / PKCE return path. Unused until a social provider is enabled in the
 * Supabase dashboard, but the provider redirect URL must already exist.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    redirect("/login?error=missing_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirect("/login?error=auth_failed");
  }

  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}
