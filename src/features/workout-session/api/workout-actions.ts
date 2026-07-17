"use server";

import { revalidatePath } from "next/cache";

import {
  DEFAULT_HOLD_SECONDS,
  defaultSetTypes,
  isTimedExercise,
  isTimedSet,
} from "@/entities/exercise/model/set-kind";
import { createClient } from "@/shared/lib/supabase/server";
import type { Enums } from "@/shared/types/database.types";

/**
 * Every action here relies on RLS for authorization rather than re-checking
 * ownership in TypeScript. A row belonging to another user is unmatchable, so a
 * write against it affects nothing and a read returns nothing -- the database
 * enforces it once, instead of every call site remembering to.
 */

type ActionResult = { error: string | null };

/**
 * Opens a workout session.
 *
 * user_id is set explicitly because the insert policy's WITH CHECK compares it
 * to auth.uid() -- the database rejects any other value rather than trusting
 * this code to pass the right one.
 */
export async function startWorkoutSession() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to start a workout." };
  }

  // Reuse an open session rather than stacking a second one: "Start workout"
  // pressed twice should return you to the workout in progress.
  const { data: existing } = await supabase
    .from("workout_sessions")
    .select("id")
    .is("ended_at", null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { sessionId: existing.id };
  }

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({ user_id: user.id })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { sessionId: data.id };
}

export async function endWorkoutSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: session, error: readError } = await supabase
    .from("workout_sessions")
    .select("started_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (readError) return { error: readError.message };
  if (!session) return { error: "Workout not found." };

  // Derived server-side from started_at rather than taken from the client: the
  // browser's clock is not evidence. Pausing is not modelled yet, so elapsed
  // wall-clock is the honest value.
  const durationSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000),
  );

  const { error } = await supabase
    .from("workout_sessions")
    .update({ ended_at: new Date().toISOString(), duration_seconds: durationSeconds })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath(`/workout/${sessionId}`);
  return { error: null };
}

/**
 * Rates a finished session, 1-5.
 *
 * The DB checks the range and rejects a comment without a rating
 * (workout_sessions_comment_needs_rating), so this validates first and returns
 * a readable message instead of surfacing a constraint name.
 */
export async function rateWorkoutSession(
  sessionId: string,
  rating: number,
  comment: string,
): Promise<ActionResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Pick a rating between 1 and 5." };
  }

  const supabase = await createClient();

  const trimmed = comment.trim();

  const { error } = await supabase
    .from("workout_sessions")
    .update({ rating, rating_comment: trimmed || null })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  revalidatePath(`/workout/${sessionId}`);
  revalidatePath("/dashboard");
  return { error: null };
}

export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const supabase = await createClient();

  // order_index is assigned from the current tail rather than passed in, so the
  // caller cannot collide with the (session, order_index) unique constraint.
  const { data: last } = await supabase
    .from("workout_session_exercises")
    .select("order_index")
    .eq("workout_session_id", sessionId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("workout_session_exercises")
    .insert({
      workout_session_id: sessionId,
      exercise_id: exerciseId,
      order_index: (last?.order_index ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/workout/${sessionId}`);
  return { sessionExerciseId: data.id, error: null };
}

export async function removeExerciseFromSession(
  sessionId: string,
  sessionExerciseId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  // Sets go with it via the FK cascade.
  const { error } = await supabase
    .from("workout_session_exercises")
    .delete()
    .eq("id", sessionExerciseId);

  if (error) return { error: error.message };

  revalidatePath(`/workout/${sessionId}`);
  return { error: null };
}

export type SetValues = {
  reps: number | null;
  weight: number | null;
  weightUnit: Enums<"weight_unit"> | null;
  durationSeconds: number | null;
  completed: boolean;
};

/**
 * Appends a set, seeded from the previous one — the usual gym pattern.
 *
 * "Previous" means the set above it in this workout. But the first set of an
 * exercise has nothing above it, and that is exactly where a blank row is most
 * annoying: you just walked up to the bench and the app makes you retype what
 * you did last week. So when there is no set to copy in this session, we reach
 * back to the last time this exercise was trained and seed from that.
 *
 * The seeded set is inserted uncompleted, so it is a suggestion, not a logged
 * lift — nothing counts until the user taps done.
 */
export async function addSet(sessionId: string, sessionExerciseId: string) {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("workout_sets")
    .select("set_index, reps, weight, weight_unit, types, duration_seconds")
    .eq("workout_session_exercise_id", sessionExerciseId)
    .order("set_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No set above it: seed the first set from the last time this exercise was
  // trained. Query from workout_session_exercises so the session filter/order
  // sits one level deep -- the nesting depth that getLastPerformances already
  // proved works. The deeper "from workout_sets" shape typechecks but is where
  // PostgREST embedded filters get unreliable.
  let seed = last;

  // With no prior set to copy, the catalogue decides how this exercise is
  // logged: a plank starts as a timed hold, a curl as weight × reps.
  let inferredTimed = false;

  if (!seed) {
    const { data: link } = await supabase
      .from("workout_session_exercises")
      .select("exercise_id, exercises(force, exercise_types)")
      .eq("id", sessionExerciseId)
      .maybeSingle();

    if (link) {
      const exercise = link.exercises;
      inferredTimed = exercise
        ? isTimedExercise(exercise.force, exercise.exercise_types)
        : false;

      const { data: prior } = await supabase
        .from("workout_session_exercises")
        .select("workout_sessions!inner(id, started_at, ended_at), workout_sets(set_index, reps, weight, weight_unit, types, duration_seconds, completed)")
        .eq("exercise_id", link.exercise_id)
        .not("workout_sessions.ended_at", "is", null)
        .neq("workout_sessions.id", sessionId)
        .order("started_at", { referencedTable: "workout_sessions", ascending: false })
        .limit(1)
        .maybeSingle();

      // The top completed set (lowest index) of that session is the seed.
      const topSet = prior?.workout_sets
        .filter((s) => s.completed)
        .sort((a, b) => a.set_index - b.set_index)[0];

      if (topSet) {
        seed = {
          set_index: -1,
          reps: topSet.reps,
          weight: topSet.weight,
          weight_unit: topSet.weight_unit,
          types: topSet.types,
          duration_seconds: topSet.duration_seconds,
        };
      }
    }
  }

  const types = seed?.types ?? defaultSetTypes(inferredTimed);
  const timed = isTimedSet(types);

  const { error } = await supabase.from("workout_sets").insert({
    workout_session_exercise_id: sessionExerciseId,
    set_index: (last?.set_index ?? -1) + 1,
    types,
    // A timed set counts seconds, not reps -- keep the two mutually exclusive so
    // the row is never ambiguous about which it is.
    reps: timed ? null : (seed?.reps ?? null),
    weight: seed?.weight ?? null,
    weight_unit: seed?.weight_unit ?? (seed?.weight != null ? "kg" : null),
    duration_seconds: timed ? (seed?.duration_seconds ?? DEFAULT_HOLD_SECONDS) : null,
    completed: false,
  });

  if (error) return { error: error.message };

  revalidatePath(`/workout/${sessionId}`);
  return { error: null };
}

export async function updateSet(
  sessionId: string,
  setId: string,
  values: SetValues,
): Promise<ActionResult> {
  const supabase = await createClient();

  // workout_sets_weight_needs_unit rejects a weight without a unit, so default
  // the unit here instead of surfacing a constraint violation to the user.
  const weight = values.weight;
  const weightUnit = weight === null ? null : (values.weightUnit ?? "kg");

  const { error } = await supabase
    .from("workout_sets")
    .update({
      reps: values.reps,
      weight,
      weight_unit: weightUnit,
      duration_seconds: values.durationSeconds,
      completed: values.completed,
    })
    .eq("id", setId);

  if (error) return { error: error.message };

  revalidatePath(`/workout/${sessionId}`);
  return { error: null };
}

export async function deleteSet(sessionId: string, setId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("workout_sets").delete().eq("id", setId);

  if (error) return { error: error.message };

  revalidatePath(`/workout/${sessionId}`);
  return { error: null };
}
