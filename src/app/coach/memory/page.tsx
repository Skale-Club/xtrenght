import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CoachNotes } from "@/features/ai-coach/ui/coach-notes";
import { createClient } from "@/shared/lib/supabase/server";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const metadata: Metadata = { title: "What the coach remembers" };

export default async function CoachMemoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/coach/memory");
  }

  // RLS scopes this to the signed-in user; no filter needed here.
  const { data: notes } = await supabase
    .from("ai_coach_notes")
    .select("id, note, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <Link href="/coach" className="text-xs text-muted hover:text-foreground">
          ← Coach
        </Link>

        <h1 className="mt-3 text-2xl font-bold tracking-tight">What the coach remembers</h1>
        <p className="mt-2 mb-6 text-sm text-muted">
          Things it noted from your conversations. It reads these before every reply — so
          if one is wrong, forget it and it stops shaping the advice.
        </p>

        <CoachNotes notes={notes ?? []} />
      </main>
    </>
  );
}
