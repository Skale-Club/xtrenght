import { redirect } from "next/navigation";

/** Onboarding is now a wizard modal over the dashboard, not its own page. */
export default function OnboardingPage() {
  redirect("/dashboard");
}
