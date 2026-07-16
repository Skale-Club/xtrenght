import Link from "next/link";

import { signOut } from "@/features/auth/api/auth-actions";
import { createClient } from "@/shared/lib/supabase/server";
import { Button, ButtonLink } from "@/shared/ui/button";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Drives the Admin link only. The admin pages do not trust this -- RLS is
  // what actually stops a non-admin writing, whatever the nav renders.
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-black tracking-tight">
          X<span className="text-accent">trenght</span>
        </Link>

        <nav className="flex items-center gap-2">
          <ButtonLink href="/programs" variant="ghost" className="hidden sm:inline-flex">
            Programs
          </ButtonLink>
          <ButtonLink href="/exercises" variant="ghost">
            Exercises
          </ButtonLink>

          {user ? (
            <>
              <ButtonLink href="/coach" variant="ghost">
                Coach
              </ButtonLink>
              {profile?.role === "admin" ? (
                <ButtonLink href="/admin/programs" variant="ghost" className="hidden sm:inline-flex">
                  Admin
                </ButtonLink>
              ) : null}
              <ButtonLink href="/favorites" variant="ghost" className="hidden sm:inline-flex">
                Saved
              </ButtonLink>
              <ButtonLink href="/dashboard" variant="ghost">
                Dashboard
              </ButtonLink>
              <form action={signOut}>
                <Button variant="secondary" type="submit">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <ButtonLink href="/login">Sign in</ButtonLink>
          )}
        </nav>
      </div>
    </header>
  );
}
