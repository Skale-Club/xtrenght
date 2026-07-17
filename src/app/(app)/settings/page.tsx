import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getTrainingProfile } from "@/entities/profile/api/profile-queries";
import { OnboardingForm } from "@/features/onboarding/ui/onboarding-form";
import { InstallButton } from "@/widgets/pwa/ui/install-prompt";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getTrainingProfile();

  if (!profile) redirect("/login?redirectTo=/settings");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-widest text-accent uppercase">Profile</h2>
        <p className="mt-1 mb-6 text-sm text-muted">
          What the coach knows about you before it reads a single set.{" "}
          <Link href="/coach/memory" className="underline hover:text-foreground">
            What it remembers
          </Link>{" "}
          is separate — that&apos;s what it worked out from talking to you. Your weight and
          measurements over time live on{" "}
          <Link href="/progress" className="underline hover:text-foreground">
            Progress
          </Link>
          .
        </p>

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
  );
}
