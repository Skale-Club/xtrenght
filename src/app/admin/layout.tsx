import { notFound } from "next/navigation";

import { createClient } from "@/shared/lib/supabase/server";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

/**
 * Admin gate.
 *
 * This is a convenience, not the security boundary -- the RLS policies are.
 * Every write these pages make is refused by Postgres for a non-admin whatever
 * this layout renders. It exists so a non-admin gets a 404 instead of a page
 * full of buttons that all fail.
 *
 * notFound() rather than a redirect: the existence of an admin area is not
 * information a stranger needs.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  if (profile?.role !== "admin") {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</main>
    </>
  );
}
