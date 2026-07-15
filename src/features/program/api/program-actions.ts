"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/shared/lib/supabase/server";

export async function enrollInProgram(programId: string, slug: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to follow a program." };
  }

  // Idempotent: the unique (user_id, program_id) would reject a second insert,
  // and pressing Follow twice should not read as an error.
  const { data: existing } = await supabase
    .from("user_program_enrollments")
    .select("id")
    .eq("program_id", programId)
    .maybeSingle();

  if (existing) {
    revalidatePath(`/programs/${slug}`);
    return { enrollmentId: existing.id, error: null };
  }

  const { data, error } = await supabase
    .from("user_program_enrollments")
    .insert({ user_id: user.id, program_id: programId })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/programs/${slug}`);
  revalidatePath("/programs");
  return { enrollmentId: data.id, error: null };
}

export async function leaveProgram(programId: string, slug: string) {
  const supabase = await createClient();

  // Deleting the enrollment cascades its progress rows, but not the workouts:
  // user_session_progress.workout_session_id cascades from the workout side,
  // not the other way. Sessions you actually did stay in your history.
  const { error } = await supabase
    .from("user_program_enrollments")
    .delete()
    .eq("program_id", programId);

  if (error) return { error: error.message };

  revalidatePath(`/programs/${slug}`);
  revalidatePath("/programs");
  return { error: null };
}

/**
 * Starts a program session: creates a workout, copies the prescription into it
 * as uncompleted sets, and links the two.
 *
 * The link is written now, not on completion. That is what lets the workout
 * page know it belongs to a program, and it is why there is no "complete
 * session" endpoint at all -- finishing the workout is what finishes the
 * program session, because that is where ended_at lives.
 */
export async function startProgramSession(programSessionId: string, slug: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to start a session." };
  }

  const { data: programSession, error: sessionError } = await supabase
    .from("program_sessions")
    .select(
      `
      id,
      program_weeks!inner ( program_id ),
      program_session_exercises (
        exercise_id, order_index,
        program_suggested_sets ( set_index, types, reps, weight, weight_unit, duration_seconds )
      )
    `,
    )
    .eq("id", programSessionId)
    .maybeSingle();

  if (sessionError) return { error: sessionError.message };
  if (!programSession) return { error: "Session not found." };

  const { data: enrollment } = await supabase
    .from("user_program_enrollments")
    .select("id")
    .eq("program_id", programSession.program_weeks.program_id)
    .maybeSingle();

  if (!enrollment) {
    return { error: "Follow the program before starting a session." };
  }

  // Already started: hand back the existing workout instead of forking a second.
  const { data: existing } = await supabase
    .from("user_session_progress")
    .select("workout_session_id")
    .eq("enrollment_id", enrollment.id)
    .eq("program_session_id", programSessionId)
    .maybeSingle();

  if (existing) {
    return { workoutSessionId: existing.workout_session_id, error: null };
  }

  const { data: workout, error: workoutError } = await supabase
    .from("workout_sessions")
    .insert({ user_id: user.id })
    .select("id")
    .single();

  if (workoutError) return { error: workoutError.message };

  // Copy the template in. The prescription is a starting point the user then
  // edits -- it is never read back from the program, so changing the program
  // later cannot rewrite what someone already lifted.
  for (const exercise of [...programSession.program_session_exercises].sort(
    (a, b) => a.order_index - b.order_index,
  )) {
    const { data: sessionExercise, error: exerciseError } = await supabase
      .from("workout_session_exercises")
      .insert({
        workout_session_id: workout.id,
        exercise_id: exercise.exercise_id,
        order_index: exercise.order_index,
      })
      .select("id")
      .single();

    if (exerciseError) return { error: exerciseError.message };

    const suggested = [...exercise.program_suggested_sets].sort((a, b) => a.set_index - b.set_index);
    if (suggested.length === 0) continue;

    const { error: setsError } = await supabase.from("workout_sets").insert(
      suggested.map((set) => ({
        workout_session_exercise_id: sessionExercise.id,
        set_index: set.set_index,
        types: set.types,
        reps: set.reps,
        weight: set.weight,
        weight_unit: set.weight_unit,
        duration_seconds: set.duration_seconds,
        completed: false,
      })),
    );

    if (setsError) return { error: setsError.message };
  }

  const { error: linkError } = await supabase.from("user_session_progress").insert({
    enrollment_id: enrollment.id,
    program_session_id: programSessionId,
    workout_session_id: workout.id,
  });

  if (linkError) return { error: linkError.message };

  revalidatePath(`/programs/${slug}`);
  return { workoutSessionId: workout.id, error: null };
}
