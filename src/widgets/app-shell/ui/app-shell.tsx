import { createClient } from "@/shared/lib/supabase/server";
import { AppSidebar } from "@/widgets/app-sidebar/ui/app-sidebar";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

/**
 * The chrome around every navigable page.
 *
 * Signed out, it's the top header -- the same bar the landing page wears, so a
 * public page like /exercises looks the same whether or not you're logged in.
 * Signed in, the nav moves into a vertical sidebar and the header disappears:
 * the app stops looking like a marketing site and starts looking like a tool.
 *
 * The choice is made here, once, rather than per page -- which is why the pages
 * underneath render only their own <main>.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <SiteHeader />
        {children}
      </>
    );
  }

  // Drives the Admin link only. The admin pages don't trust this -- RLS is what
  // actually stops a non-admin writing, whatever the nav renders.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <AppSidebar email={user.email} isAdmin={profile?.role === "admin"} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
