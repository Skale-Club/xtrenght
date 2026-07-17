import type { Enums } from "@/shared/types/database.types";

type SetType = Enums<"workout_set_type">;
type ExerciseForce = Enums<"exercise_force">;
type ExerciseType = Enums<"exercise_type">;

/** How long a timed set defaults to before anyone edits it -- a plank, a hold. */
export const DEFAULT_HOLD_SECONDS = 30;

/**
 * Whether an exercise is naturally logged by time held rather than reps.
 *
 * Isometrics have no rep to count: a plank, a wall sit, a static stretch is
 * measured in seconds, not repetitions. The catalogue flags these two ways --
 * a STATIC force, or a STRETCHING/STABILIZATION type -- and either is enough.
 * Everything else counts reps, which is the overwhelming default.
 *
 * This is the app deciding on its own, from the catalogue, so a manually added
 * plank still shows a timer. The coach can override per set when it prescribes;
 * this is the floor, not the ceiling.
 */
export function isTimedExercise(
  force: ExerciseForce | null,
  exerciseTypes: ExerciseType[],
): boolean {
  if (force === "STATIC") return true;
  return exerciseTypes.some((type) => type === "STRETCHING" || type === "STABILIZATION");
}

/** Whether a set, by its stored types, is logged as a held duration. */
export function isTimedSet(types: SetType[]): boolean {
  return types.includes("TIME");
}

/** The set `types` a freshly added set should carry, given how the exercise is measured. */
export function defaultSetTypes(timed: boolean): SetType[] {
  return timed ? ["TIME"] : ["WEIGHT", "REPS"];
}
