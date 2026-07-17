"use server";

import { revalidatePath } from "next/cache";

import { EQUIPMENT_OPTIONS } from "@/entities/profile/model/equipment-options";
import { createClient } from "@/shared/lib/supabase/server";
import type { Enums } from "@/shared/types/database.types";

const GOALS: Enums<"training_goal">[] = [
  "STRENGTH",
  "HYPERTROPHY",
  "ENDURANCE",
  "WEIGHT_LOSS",
  "GENERAL_FITNESS",
];

const OFFERED = new Set(EQUIPMENT_OPTIONS.map((o) => o.value));

export type ProfileInput = {
  equipment: string[];
  goal: string | null;
  sessionsPerWeek: number | null;
  limitations: string;
  bodyWeight: number | null;
  weightUnit: "kg" | "lbs";
};

/**
 * Saves the training profile, and stamps onboarded_at so we stop asking.
 *
 * Everything is validated here rather than trusted from the client. The
 * database would refuse a bad enum or an out-of-range week anyway -- these
 * checks exist so the user gets a sentence instead of a constraint name.
 */
export async function saveTrainingProfile(input: ProfileInput) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  // Only values we actually offer. A client sending SMITH_MACHINE would pass
  // the enum check in Postgres and then match zero exercises forever -- valid,
  // and useless, which is the worst kind of bad data.
  const equipment = input.equipment.filter((e): e is Enums<"equipment"> => OFFERED.has(e as Enums<"equipment">));

  const goal = input.goal && GOALS.includes(input.goal as Enums<"training_goal">)
    ? (input.goal as Enums<"training_goal">)
    : null;

  if (input.sessionsPerWeek !== null && (input.sessionsPerWeek < 1 || input.sessionsPerWeek > 7)) {
    return { error: "Sessions per week has to be between 1 and 7." };
  }

  if (input.bodyWeight !== null && (input.bodyWeight <= 0 || input.bodyWeight >= 1000)) {
    return { error: "That bodyweight doesn't look right." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      available_equipment: equipment,
      training_goal: goal,
      sessions_per_week: input.sessionsPerWeek,
      limitations: input.limitations.trim() || null,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  // A weigh-in is an event, not a field: only insert when they gave one, and
  // never overwrite the last. Weight is a body_measurement of type WEIGHT, so
  // an onboarding weigh-in is the first point on the progress chart.
  if (input.bodyWeight !== null) {
    const { error: weightError } = await supabase.from("body_measurements").insert({
      user_id: user.id,
      type: "WEIGHT",
      value: input.bodyWeight,
      unit: input.weightUnit,
    });
    if (weightError) return { error: weightError.message };
  }

  revalidatePath("/settings");
  revalidatePath("/progress");
  revalidatePath("/coach");
  revalidatePath("/exercises");
  return { error: null };
}

/**
 * Marks onboarding as seen without answering anything.
 *
 * available_equipment stays NULL, which the filter reads as "no filter" -- a
 * skipper sees the whole catalogue, which is the right default for someone who
 * told us nothing.
 */
export async function skipOnboarding() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}
