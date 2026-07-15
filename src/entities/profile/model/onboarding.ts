/**
 * The onboarding questionnaire — its shape, its options, and its validation.
 *
 * Answers are stored in `profiles.onboarding_preferences` (a jsonb column that
 * already exists on the table). This module is the single source of truth for
 * what that JSON may contain: the form renders its options from here, and the
 * server action validates against the very same lists, so the two can never
 * drift.
 *
 * Deliberately isomorphic — no `server-only` import — because the client form
 * needs the option lists and the server action needs the validator. It only
 * pulls a *type* from the generated DB types, which erases at build time.
 */

import type { Enums } from "@/shared/types/database.types";

export type Equipment = Enums<"equipment">;

/** What the member is training for. Drives the tone of a personalised plan. */
export type Goal = "muscle" | "strength" | "fat_loss" | "endurance" | "mobility" | "general";

/** Where they train. The strongest signal for which equipment is even in play. */
export type TrainingLocation = "home" | "gym" | "both" | "outdoor";

/**
 * Bumped when the stored shape changes incompatibly. Reading code can then
 * decide to re-ask rather than trust an old answer it can't interpret.
 */
export const ONBOARDING_VERSION = 1;

export type OnboardingPreferences = {
  version: number;
  goal: Goal;
  location: TrainingLocation;
  /** Equipment the member actually owns. Never empty — see normalisation below. */
  equipment: Equipment[];
  age: number;
  heightCm: number;
};

export const GOAL_OPTIONS: { value: Goal; label: string; hint: string }[] = [
  { value: "muscle", label: "Build muscle", hint: "Add size and definition" },
  { value: "strength", label: "Get stronger", hint: "Move heavier weight" },
  { value: "fat_loss", label: "Lose fat", hint: "Lean out and cut weight" },
  { value: "endurance", label: "Endurance", hint: "Build conditioning and stamina" },
  { value: "mobility", label: "Mobility", hint: "Move better, stay flexible" },
  { value: "general", label: "General fitness", hint: "Stay healthy and active" },
];

export const LOCATION_OPTIONS: { value: TrainingLocation; label: string; hint: string }[] = [
  { value: "home", label: "At home", hint: "Whatever you keep in the house" },
  { value: "gym", label: "At a gym", hint: "Full rack of equipment on hand" },
  { value: "both", label: "Home & gym", hint: "A bit of both, week to week" },
  { value: "outdoor", label: "Outdoors", hint: "Parks, calisthenics, the open air" },
];

/**
 * The equipment we ask about, in a sensible order.
 *
 * A curated subset of the `equipment` enum: the things a member would
 * recognise and check off, not the full catalogue (which includes CAR, TYRE,
 * SLED and other gym-of-Atlas exotica). `BODY_ONLY` leads because bodyweight is
 * always an option and picking nothing else is a valid answer.
 */
export const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: "BODY_ONLY", label: "Bodyweight only" },
  { value: "BANDS", label: "Resistance bands" },
  { value: "DUMBBELL", label: "Dumbbells" },
  { value: "KETTLEBELLS", label: "Kettlebells" },
  { value: "BARBELL", label: "Barbell" },
  { value: "WEIGHT_PLATE", label: "Weight plates" },
  { value: "EZ_BAR", label: "EZ curl bar" },
  { value: "BENCH", label: "Bench" },
  { value: "PULLUP_BAR", label: "Pull-up bar" },
  { value: "TRX", label: "Suspension trainer" },
  { value: "MACHINE", label: "Weight machine" },
  { value: "CABLE", label: "Cable machine" },
  { value: "SMITH_MACHINE", label: "Smith machine" },
  { value: "MEDICINE_BALL", label: "Medicine ball" },
  { value: "SWISS_BALL", label: "Swiss ball" },
  { value: "BOSU", label: "Bosu ball" },
  { value: "FOAM_ROLL", label: "Foam roller" },
  { value: "BOX", label: "Plyo box" },
  { value: "STEP", label: "Step platform" },
  { value: "SPIN_BIKE", label: "Exercise bike" },
  { value: "ROPES", label: "Battle ropes" },
];

export const AGE_MIN = 13;
export const AGE_MAX = 100;
export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 250;

const GOAL_VALUES = new Set<string>(GOAL_OPTIONS.map((o) => o.value));
const LOCATION_VALUES = new Set<string>(LOCATION_OPTIONS.map((o) => o.value));
const EQUIPMENT_VALUES = new Set<string>(EQUIPMENT_OPTIONS.map((o) => o.value));

const GOAL_LABELS = new Map(GOAL_OPTIONS.map((o) => [o.value, o.label]));
const LOCATION_LABELS = new Map(LOCATION_OPTIONS.map((o) => [o.value, o.label]));
const EQUIPMENT_LABELS = new Map(EQUIPMENT_OPTIONS.map((o) => [o.value, o.label]));

export function goalLabel(value: Goal): string {
  return GOAL_LABELS.get(value) ?? value;
}

export function locationLabel(value: TrainingLocation): string {
  return LOCATION_LABELS.get(value) ?? value;
}

/** Falls back to a title-cased enum value so an uncurated item still reads. */
export function equipmentLabel(value: Equipment): string {
  return (
    EQUIPMENT_LABELS.get(value) ??
    value
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** The un-typed answers as they arrive from a form or from stored JSON. */
export type OnboardingInput = {
  goal?: unknown;
  location?: unknown;
  equipment?: unknown;
  age?: unknown;
  heightCm?: unknown;
};

export type ValidationResult =
  | { ok: true; value: OnboardingPreferences }
  | { ok: false; error: string };

function toInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "" || !/^-?\d+$/.test(trimmed)) return null;
    return Number.parseInt(trimmed, 10);
  }
  return null;
}

/**
 * The one authoritative validator, used by the server action (untrusted form
 * data) and by {@link parseOnboarding} (our own stored JSON). Returning a
 * message rather than throwing lets the action surface it in the form.
 */
export function validateOnboarding(input: OnboardingInput): ValidationResult {
  const goal = input.goal;
  if (typeof goal !== "string" || !GOAL_VALUES.has(goal)) {
    return { ok: false, error: "Pick a training goal." };
  }

  const location = input.location;
  if (typeof location !== "string" || !LOCATION_VALUES.has(location)) {
    return { ok: false, error: "Tell us where you train." };
  }

  // Accept a single value or a list; keep only options we actually offer, drop
  // duplicates. An empty result means "nothing but my bodyweight", which is a
  // real answer rather than a mistake.
  const rawEquipment = Array.isArray(input.equipment)
    ? input.equipment
    : input.equipment == null
      ? []
      : [input.equipment];
  const equipment = [
    ...new Set(rawEquipment.filter((e): e is Equipment => typeof e === "string" && EQUIPMENT_VALUES.has(e))),
  ];
  if (equipment.length === 0) {
    equipment.push("BODY_ONLY");
  }

  const age = toInteger(input.age);
  if (age === null || age < AGE_MIN || age > AGE_MAX) {
    return { ok: false, error: `Enter an age between ${AGE_MIN} and ${AGE_MAX}.` };
  }

  const heightCm = toInteger(input.heightCm);
  if (heightCm === null || heightCm < HEIGHT_MIN_CM || heightCm > HEIGHT_MAX_CM) {
    return { ok: false, error: `Enter a height between ${HEIGHT_MIN_CM} and ${HEIGHT_MAX_CM} cm.` };
  }

  return {
    ok: true,
    // goal and location are cast to their unions: membership in the option set
    // was just checked above, which `Set.has` can't narrow on its own.
    value: {
      version: ONBOARDING_VERSION,
      goal: goal as Goal,
      location: location as TrainingLocation,
      equipment,
      age,
      heightCm,
    },
  };
}

/**
 * Reads stored preferences back into a typed object, or null if the row is
 * absent or no longer conforms. Null reads as "not onboarded", which sends the
 * member (back) through the questionnaire rather than trusting a shape we can't
 * make sense of.
 */
export function parseOnboarding(json: unknown): OnboardingPreferences | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return null;
  }
  const result = validateOnboarding(json as OnboardingInput);
  return result.ok ? result.value : null;
}
