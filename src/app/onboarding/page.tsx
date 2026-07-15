import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOnboarding } from "@/entities/profile/api/profile-queries";
import { createClient } from "@/shared/lib/supabase/server";
import { OnboardingForm } from "@/features/onboarding/ui/onboarding-form";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const metadata: Metadata = { title: "Set up your plan" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The route is private, so proxy.ts already redirects a signed-out visitor.
  // This repeats the check to satisfy the type and to hold if reached directly.
  if (!user) {
    redirect("/login?redirectTo=/onboarding");
  }

  // Doubles as the edit screen: existing answers pre-fill the form, so the same
  // page serves a first-time member and one revising their setup later.
  const preferences = await getOnboarding();
  const isEditing = preferences !== null;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">
          {isEditing ? "Your training setup" : "Let's personalize your plan"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {isEditing
            ? "Update any of this and your recommendations follow along."
            : "A few quick questions. What you own and what you're after decide which programs we put in front of you — a home setup with bands gets a different plan than a full gym."}
        </p>

        <div className="mt-10">
          <OnboardingForm defaultValues={preferences} />
        </div>
      </main>
    </>
  );
}
