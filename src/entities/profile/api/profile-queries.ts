import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Enums } from "@/shared/types/database.types";

export type TrainingProfile = {
  displayName: string;
  availableEquipment: Enums<"equipment">[] | null;
  trainingGoal: Enums<"training_goal"> | null;
  sessionsPerWeek: number | null;
  limitations: string | null;
  onboardedAt: string | null;
  /** Most recent weigh-in, if there is one. */
  bodyWeight: { weight: number; unit: Enums<"weight_unit">; measuredAt: string } | null;
};

/**
 * The signed-in user's training profile.
 *
 * RLS scopes both reads to them, so neither query filters by id: a row that is
 * not theirs is not matchable.
 */
export async function getTrainingProfile(): Promise<TrainingProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, available_equipment, training_goal, sessions_per_week, limitations, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  // Bodyweight is the newest WEIGHT measurement -- weight lives in
  // body_measurements now, one type among several rather than its own table.
  const { data: weight } = await supabase
    .from("body_measurements")
    .select("value, unit, measured_at")
    .eq("type", "WEIGHT")
    .order("measured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    displayName: profile.display_name,
    availableEquipment: profile.available_equipment,
    trainingGoal: profile.training_goal,
    sessionsPerWeek: profile.sessions_per_week,
    limitations: profile.limitations,
    onboardedAt: profile.onboarded_at,
    bodyWeight:
      weight && (weight.unit === "kg" || weight.unit === "lbs")
        ? { weight: Number(weight.value), unit: weight.unit, measuredAt: weight.measured_at }
        : null,
  };
}

