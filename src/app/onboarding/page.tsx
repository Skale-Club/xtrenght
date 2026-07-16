import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getTrainingProfile } from "@/entities/profile/api/profile-queries";
import { OnboardingForm } from "@/features/onboarding/ui/onboarding-form";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const profile = await getTrainingProfile();

  if (!profile) redirect("/login?redirectTo=/onboarding");

  // Answered or skipped -- either way they've seen it. /profile is where you
  // change your mind; this page exists once.
  if (profile.onboardedAt) redirect("/profile");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <p className="text-xs font-semibold tracking-widest text-accent uppercase">Welcome</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        Let&apos;s make this yours, {profile.displayName}
      </h1>
      <p className="mt-2 mb-8 text-sm text-muted">
        Four questions. They decide what the coach offers you — without them it can only
        see what you&apos;ve already logged, which right now is nothing. You can skip and
        change all of it later.
      </p>

      <OnboardingForm mode="onboarding" />
    </main>
  );
}
