"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/shared/lib/supabase/server";
import { validateOnboarding } from "@/entities/profile/model/onboarding";
import type { Json } from "@/shared/types/database.types";

export type OnboardingFormState = { error: string | null };

/**
 * Persists the onboarding questionnaire for the signed-in member.
 *
 * The form is validated on the client for nudges, but this is the authority:
 * it re-checks every field with the same {@link validateOnboarding} the form
 * renders from, so a hand-crafted POST can't seed a malformed answer. Auth is
 * verified here too — a Server Action is a public endpoint, and RLS would in
 * any case reject a write to a row that isn't the caller's.
 */
export async function saveOnboarding(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const result = validateOnboarding({
    goal: formData.get("goal"),
    location: formData.get("location"),
    equipment: formData.getAll("equipment"),
    age: formData.get("age"),
    heightCm: formData.get("heightCm"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to save your preferences." };
  }

  const { error } = await supabase
    .from("profiles")
    // Cast because jsonb columns are typed as the open `Json` union; the value
    // is a concrete object whose fields are all JSON-safe.
    .update({ onboarding_preferences: result.value as unknown as Json })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  // The dashboard reads these to gate access and to pick recommendations.
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  redirect("/dashboard");
}
