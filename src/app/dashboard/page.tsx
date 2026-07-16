import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Link from "next/link";

import { getTrainingProfile } from "@/entities/profile/api/profile-queries";
import {
  getActiveSession,
  getSessionSummary,
  listRecentSessions,
} from "@/entities/workout/api/workout-queries";
import { OnboardingWizard } from "@/features/onboarding/ui/onboarding-wizard";
import { createClient } from "@/shared/lib/supabase/server";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { StartWorkoutButton } from "@/features/workout-session/ui/start-workout-button";

export const metadata: Metadata = { title: "Dashboard" };

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Stat({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 numeric text-3xl font-bold">
        {value}
        {unit ? <span className="ml-1 text-base font-medium text-muted">{unit}</span> : null}
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already gates this route; this second check is what makes `user`
  // non-null for TypeScript and covers the route being reached directly.
  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  // First landing after signup: the setup wizard opens over the dashboard.
  // onboarded_at is stamped whether they answer or skip, so it shows once and
  // never nags. A modal rather than a redirect so there's a real page behind it
  // -- skipping leaves you already where you meant to be.
  const profile = await getTrainingProfile();
  const needsOnboarding = Boolean(profile && !profile.onboardedAt);

  const [summary, sessions, active] = await Promise.all([
    getSessionSummary(),
    listRecentSessions(),
    getActiveSession(),
  ]);

  return (
    <>
      <SiteHeader />

      {needsOnboarding ? <OnboardingWizard displayName={profile?.displayName ?? "there"} /> : null}

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-muted">{user.email}</p>
          </div>
          <StartWorkoutButton resumeId={active?.id} />
        </div>

        <div className="mb-12 grid gap-4 sm:grid-cols-3">
          <Stat label="Sessions" value={summary.totalSessions} />
          <Stat label="Sets completed" value={summary.completedSets} />
          <Stat label="Total volume" value={summary.totalVolume.toLocaleString("en-US")} unit="kg" />
        </div>

        <h2 className="mb-4 text-lg font-semibold">Recent sessions</h2>

        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted">No sessions yet. Start your first workout.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/workout/${session.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-muted"
                >
                  <div>
                    <p className="font-medium">{formatDate(session.started_at)}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {session.workout_session_exercises.length} exercise
                      {session.workout_session_exercises.length === 1 ? "" : "s"}
                      {session.ended_at ? "" : " · in progress"}
                    </p>
                  </div>
                  {session.duration_seconds ? (
                    <span className="numeric text-sm text-muted">
                      {Math.round(session.duration_seconds / 60)} min
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
