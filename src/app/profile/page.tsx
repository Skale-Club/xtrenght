import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getBodyWeightHistory, getTrainingProfile } from "@/entities/profile/api/profile-queries";
import { OnboardingForm } from "@/features/onboarding/ui/onboarding-form";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await getTrainingProfile();

  if (!profile) redirect("/login?redirectTo=/profile");

  const history = await getBodyWeightHistory();
  const first = history[0];
  const last = history[history.length - 1];
  const drift = first && last && history.length > 1 ? last.weight - first.weight : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="mt-2 mb-8 text-sm text-muted">
          What the coach knows about you before it reads a single set.{" "}
          <Link href="/coach/memory" className="underline hover:text-foreground">
            What it remembers
          </Link>{" "}
          is separate — that&apos;s what it worked out from talking to you.
        </p>

        {history.length > 1 ? (
          <div className="mb-8 rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs text-muted">Bodyweight</p>
            <p className="mt-0.5 text-sm">
              {last.weight} {last.weight_unit} now, {first.weight} {first.weight_unit} at the
              start
              {drift !== null && drift !== 0 ? (
                <>
                  {" — "}
                  <span className={drift > 0 ? "text-foreground" : "text-foreground"}>
                    {drift > 0 ? "+" : ""}
                    {drift.toFixed(1)} {last.weight_unit}
                  </span>{" "}
                  across {history.length} entries
                </>
              ) : null}
            </p>
          </div>
        ) : null}

        <OnboardingForm
          mode="edit"
          initial={{
            equipment: profile.availableEquipment ?? [],
            goal: profile.trainingGoal,
            sessionsPerWeek: profile.sessionsPerWeek,
            limitations: profile.limitations ?? "",
            bodyWeight: profile.bodyWeight?.weight ?? null,
            weightUnit: profile.bodyWeight?.unit ?? "kg",
          }}
        />
      </main>
    </>
  );
}
