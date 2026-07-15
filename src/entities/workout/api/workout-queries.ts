import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Enums, Tables } from "@/shared/types/database.types";

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
      rating,
      rating_comment,
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

export type ExerciseHistoryEntry = {
  sessionId: string;
  date: string;
  sets: { weightKg: number | null; reps: number | null }[];
  topWeightKg: number | null;
  volumeKg: number;
};

export type ExerciseHistory = {
  entries: ExerciseHistoryEntry[];
  personalRecordKg: number | null;
  totalSets: number;
};

const LBS_TO_KG = 0.453_592_37;

/** Normalises to kg so a log that mixes units still compares and sums. */
function toKg(weight: number | null, unit: Enums<"weight_unit"> | null) {
  if (weight === null) return null;
  return unit === "lbs" ? weight * LBS_TO_KG : weight;
}

/**
 * This user's history for one exercise, newest first.
 *
 * This is the query the schema was shaped around: because weight and reps are
 * their own columns rather than positions in a parallel array, "heaviest set"
 * and "volume" are ordinary aggregates over an index. In workout-cool's
 * layout, the weight's array position varies per row, so neither is expressible
 * in SQL at all.
 *
 * RLS scopes it -- no user filter needed, and another user's sets are simply
 * not visible to join against.
 */
export async function getExerciseHistory(exerciseId: string, limit = 20): Promise<ExerciseHistory> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workout_session_exercises")
    .select(
      `
      workout_sessions!inner ( id, started_at, ended_at ),
      workout_sets ( weight, weight_unit, reps, completed )
    `,
    )
    .eq("exercise_id", exerciseId)
    .not("workout_sessions.ended_at", "is", null)
    .order("started_at", { referencedTable: "workout_sessions", ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load exercise history: ${error.message}`);
  }

  const entries: ExerciseHistoryEntry[] = [];
  let personalRecordKg: number | null = null;
  let totalSets = 0;

  for (const row of data) {
    const session = row.workout_sessions;
    if (!session) continue;

    // Only completed sets count. A set you planned and skipped is not a lift.
    const done = row.workout_sets.filter((set) => set.completed);
    if (done.length === 0) continue;

    const sets = done.map((set) => ({ weightKg: toKg(set.weight, set.weight_unit), reps: set.reps }));
    totalSets += sets.length;

    const weights = sets.map((s) => s.weightKg).filter((w): w is number => w !== null);
    const topWeightKg = weights.length ? Math.max(...weights) : null;

    if (topWeightKg !== null && (personalRecordKg === null || topWeightKg > personalRecordKg)) {
      personalRecordKg = topWeightKg;
    }

    entries.push({
      sessionId: session.id,
      date: session.started_at,
      sets,
      topWeightKg,
      volumeKg: sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0),
    });
  }

  // Sorted here rather than trusting the nested order, which PostgREST applies
  // to the embedded table and not to the parent rows.
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { entries, personalRecordKg, totalSets };
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
