"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/shared/lib/supabase/server";

/**
 * Opens a workout session for the current user.
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

export async function endWorkoutSession(sessionId: string, durationSeconds: number) {
  const supabase = await createClient();

  // No user check: the update policy's USING clause makes another user's
  // session unmatchable, so this reports "not found" rather than editing it.
  const { error } = await supabase
    .from("workout_sessions")
    .update({ ended_at: new Date().toISOString(), duration_seconds: durationSeconds })
    .eq("id", sessionId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { error: null };
}

export async function addExerciseToSession(sessionId: string, exerciseId: string, orderIndex: number) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workout_session_exercises")
    .insert({ workout_session_id: sessionId, exercise_id: exerciseId, order_index: orderIndex })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { sessionExerciseId: data.id };
}
