import type { Enums } from "@/shared/types/database.types";

/** The training goals offered in onboarding and the profile panel. */
export const GOAL_OPTIONS: { value: Enums<"training_goal">; label: string; hint: string }[] = [
  { value: "STRENGTH", label: "Get stronger", hint: "Heavier lifts, lower reps" },
  { value: "HYPERTROPHY", label: "Build muscle", hint: "More volume, moderate reps" },
  { value: "ENDURANCE", label: "Build endurance", hint: "Higher reps, shorter rest" },
  { value: "WEIGHT_LOSS", label: "Lose weight", hint: "Work capacity, calorie burn" },
  { value: "GENERAL_FITNESS", label: "Stay in shape", hint: "A bit of everything" },
];
