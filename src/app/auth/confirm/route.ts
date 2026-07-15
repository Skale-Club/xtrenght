import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/shared/lib/supabase/server";

/**
 * Landing point for the links Supabase emails (signup confirmation, magic link,
 * password recovery). Exchanges the one-time token for a session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (!token_hash || !type) {
    redirect("/login?error=invalid_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    redirect("/login?error=expired_link");
  }

  // Strips token_hash from the URL, keeping it out of history and referrers.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}
