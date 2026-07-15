import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Tables } from "@/shared/types/database.types";

export type WorkoutSession = Tables<"workout_sessions">;

/**
 * Recent sessions for the signed-in user.
 *
 * No .eq("user_id", ...) filter: the RLS select policy scopes rows to
 * auth.uid() inside Postgres. Filtering here as well would be a second,
 * weaker copy of a rule that already holds.
 */
export async function listRecentSessions(limit = 10) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      `
      id,
      started_at,
      ended_at,
      duration_seconds,
      rating,
      workout_session_exercises (
        id,
        order_index,
        exercises ( id, name, slug ),
        workout_sets ( id, set_index, types, reps, weight, weight_unit, duration_seconds, completed )
      )
    `,
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list workout sessions: ${error.message}`);
  }

  return data;
}

/**
 * One session with everything needed to render the logging screen.
 *
 * No user_id filter, same as above: the RLS policy scopes it. A session
 * belonging to someone else simply comes back null, which the page renders as
 * a 404 -- indistinguishable from a session that never existed, which is the
 * right thing to leak (nothing).
 */
export async function getWorkoutSession(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      `
      id,
      started_at,
      ended_at,
      duration_seconds,
      workout_session_exercises (
        id,
        order_index,
        exercises ( id, name, slug, image_urls ),
        workout_sets ( id, set_index, types, reps, weight, weight_unit, duration_seconds, completed )
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load workout session: ${error.message}`);
  }

  if (!data) return null;

  // PostgREST cannot order nested rows, so the shape arrives unsorted.
  const exercises = [...data.workout_session_exercises]
    .sort((a, b) => a.order_index - b.order_index)
    .map((exercise) => ({
      ...exercise,
      workout_sets: [...exercise.workout_sets].sort((a, b) => a.set_index - b.set_index),
    }));

  return { ...data, workout_session_exercises: exercises };
}

export type WorkoutSessionDetail = NonNullable<Awaited<ReturnType<typeof getWorkoutSession>>>;

/** The session the user is mid-way through, if any. At most one is open. */
export async function getActiveSession() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("id, started_at")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load the active session: ${error.message}`);
  }

  return data;
}

export type SessionSummary = {
  totalSessions: number;
  completedSets: number;
  totalVolume: number;
};

/**
 * Headline numbers for the dashboard.
 *
 * Volume (sum of weight x reps) is computed here rather than in SQL because
 * PostgREST cannot express the aggregate. At a real user's set count this is
 * fine; if it ever isn't, it becomes a Postgres view or an RPC.
 */
export async function getSessionSummary(): Promise<SessionSummary> {
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("workout_sessions")
    .select("id", { count: "exact", head: true });

  if (countError) {
    throw new Error(`Failed to count workout sessions: ${countError.message}`);
  }

  const { data: sets, error: setsError } = await supabase
    .from("workout_sets")
    .select("reps, weight, weight_unit, completed")
    .eq("completed", true);

  if (setsError) {
    throw new Error(`Failed to load workout sets: ${setsError.message}`);
  }

  const totalVolume = sets.reduce((sum, set) => {
    if (set.reps === null || set.weight === null) return sum;
    // Normalise to kg so mixed-unit logs still add up.
    const kg = set.weight_unit === "lbs" ? set.weight * 0.453_592_37 : set.weight;
    return sum + kg * set.reps;
  }, 0);

  return {
    totalSessions: count ?? 0,
    completedSets: sets.length,
    totalVolume: Math.round(totalVolume),
  };
}
