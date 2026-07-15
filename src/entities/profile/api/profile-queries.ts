import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import { parseOnboarding, type OnboardingPreferences } from "@/entities/profile/model/onboarding";

/**
 * The signed-in member's onboarding answers, typed — or null if they haven't
 * been through it yet (a fresh profile leaves the column NULL).
 *
 * RLS scopes the row to its owner, so no explicit id filter is needed: the
 * query can only ever return this user's profile. Returns null when signed out
 * for the same reason — anon sees no profile rows.
 */
export async function getOnboarding(): Promise<OnboardingPreferences | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_preferences")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load onboarding preferences: ${error.message}`);
  }

  return parseOnboarding(data?.onboarding_preferences);
}
