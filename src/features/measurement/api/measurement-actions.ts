"use server";

import { revalidatePath } from "next/cache";

import { unitsFor, type MeasurementType, type MeasurementUnit } from "@/entities/measurement/model/measurement-types";
import { createClient } from "@/shared/lib/supabase/server";

const TYPES = new Set<MeasurementType>([
  "WEIGHT",
  "BODY_FAT",
  "NECK",
  "SHOULDERS",
  "CHEST",
  "ARM",
  "FOREARM",
  "WAIST",
  "HIP",
  "THIGH",
  "CALF",
]);

/**
 * Records one measurement. Validated here so the user gets a sentence, not a
 * constraint name -- though RLS and the check constraint would refuse bad data
 * regardless.
 */
export async function logMeasurement(type: string, value: number, unit: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  if (!TYPES.has(type as MeasurementType)) return { error: "Unknown measurement." };
  const t = type as MeasurementType;

  // The unit has to be one this measure accepts -- no logging a waist in kg.
  if (!unitsFor(t).includes(unit as MeasurementUnit)) {
    return { error: "That unit doesn't fit this measurement." };
  }

  if (!Number.isFinite(value) || value <= 0) return { error: "Enter a number greater than zero." };
  if (unit === "percent" && value >= 100) return { error: "A percentage has to be under 100." };
  if (value >= 10000) return { error: "That value looks too large." };

  const { error } = await supabase
    .from("body_measurements")
    .insert({ user_id: user.id, type: t, value, unit: unit as MeasurementUnit });

  if (error) return { error: error.message };

  revalidatePath("/progress");
  return { error: null };
}

/** Removes one measurement. RLS makes another user's row unmatchable. */
export async function deleteMeasurement(id: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("body_measurements").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/progress");
  return { error: null };
}
