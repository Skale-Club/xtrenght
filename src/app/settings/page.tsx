import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getBodyWeightHistory, getTrainingProfile } from "@/entities/profile/api/profile-queries";
import { OnboardingForm } from "@/features/onboarding/ui/onboarding-form";
import { InstallButton } from "@/widgets/pwa/ui/install-prompt";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getTrainingProfile();

  if (!profile) redirect("/login?redirectTo=/settings");

  const history = await getBodyWeightHistory();
  const first = history[0];
  const last = history[history.length - 1];
  const drift = first && last && history.length > 1 ? last.weight - first.weight : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-widest text-accent uppercase">Profile</h2>
          <p className="mt-1 mb-6 text-sm text-muted">
            What the coach knows about you before it reads a single set.{" "}
            <Link href="/coach/memory" className="underline hover:text-foreground">
              What it remembers
            </Link>{" "}
            is separate — that&apos;s what it worked out from talking to you.
          </p>

          {history.length > 1 ? (
            <div className="mb-6 rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">Bodyweight</p>
              <p className="mt-0.5 text-sm">
                {last.weight} {last.weight_unit} now, {first.weight} {first.weight_unit} at the start
                {drift !== null && drift !== 0 ? (
                  <>
                    {" — "}
                    <span>
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
        </section>

        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-sm font-semibold tracking-widest text-accent uppercase">App</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Install Xtrenght for full-screen access and a home-screen icon.
          </p>
          <InstallButton />
        </section>
      </main>
    </>
  );
}
