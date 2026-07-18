import type { TablesUpdate } from "@/shared/types/database.types";
import type { Tool, ToolContext } from "@/features/mcp/api/tools/types";
import { fail } from "@/features/mcp/api/tools/types";
import { WEIGHT_UNITS, WORKOUT_SET_TYPES } from "@/features/mcp/api/tools/enums";

/**
 * Tools for building and logging a workout: open a session, add exercises,
 * record sets, finish and rate it, and read history back.
 *
 * Ownership is never checked here. Every row these touch is scoped to the
 * caller by RLS, so a set that belongs to someone else is simply unmatchable --
 * the update hits nothing and the read returns nothing.
 */

const LBS_TO_KG = 0.453_592_37;

async function tailIndex(
  ctx: ToolContext,
  table: "workout_session_exercises" | "workout_sets",
  column: string,
  parentColumn: string,
  parentId: string,
) {
  const { data } = await ctx.supabase
    .from(table)
    .select(column)
    .eq(parentColumn, parentId)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as Record<string, number> | null)?.[column] ?? -1) + 1;
}

const startWorkout: Tool = {
  name: "start_workout",
  title: "Start a workout",
  description:
    "Open a new workout session, or return the one already in progress -- there " +
    "is at most one open session per user, so this is safe to call repeatedly. " +
    "Returns the session id to add exercises to.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { idempotentHint: true },
  handler: async (_input, { supabase, user }) => {
    const { data: existing } = await supabase
      .from("workout_sessions")
      .select("id, started_at")
      .is("ended_at", null)
      .limit(1)
      .maybeSingle();

    if (existing) return { sessionId: existing.id, startedAt: existing.started_at, resumed: true };

    const { data, error } = await supabase
      .from("workout_sessions")
      .insert({ user_id: user.id })
      .select("id, started_at")
      .single();

    if (error) fail(error.message);
    return { sessionId: data!.id, startedAt: data!.started_at, resumed: false };
  },
};

const getActiveWorkout: Tool = {
  name: "get_active_workout",
  title: "Get the active workout",
  description: "Return the workout currently in progress, if any, with its exercises and sets.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  handler: async (_input, { supabase }) => {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("id")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) fail(error.message);
    if (!data) return { active: null };
    return loadWorkout(supabase, data.id);
  },
};

async function loadWorkout(supabase: ToolContext["supabase"], id: string) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      `
      id, started_at, ended_at, duration_seconds, rating, rating_comment,
      workout_session_exercises (
        id, order_index,
        exercises ( id, name, slug ),
        workout_sets ( id, set_index, types, reps, weight, weight_unit, duration_seconds, completed )
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) fail(error.message);
  if (!data) fail("Workout not found.");

  data.workout_session_exercises.sort((a, b) => a.order_index - b.order_index);
  for (const exercise of data.workout_session_exercises) {
    exercise.workout_sets.sort((a, b) => a.set_index - b.set_index);
  }
  return data;
}

const getWorkout: Tool = {
  name: "get_workout",
  title: "Get a workout",
  description: "Fetch one workout session by id, with its exercises and every set.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sessionId"],
    properties: { sessionId: { type: "string", description: "The workout session uuid." } },
  },
  annotations: { readOnlyHint: true },
  handler: async (input, { supabase }) => loadWorkout(supabase, (input as { sessionId: string }).sessionId),
};

const listRecentWorkouts: Tool = {
  name: "list_recent_workouts",
  title: "List recent workouts",
  description: "List the caller's most recent workout sessions, newest first, with a set count each.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
  },
  annotations: { readOnlyHint: true },
  handler: async (input, { supabase }) => {
    const { limit = 10 } = input as { limit?: number };
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("id, started_at, ended_at, duration_seconds, rating, workout_session_exercises (id, exercises (name), workout_sets (id, completed))")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) fail(error.message);

    return (data ?? []).map((s) => ({
      id: s.id,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      durationSeconds: s.duration_seconds,
      rating: s.rating,
      exerciseCount: s.workout_session_exercises.length,
      completedSets: s.workout_session_exercises.reduce(
        (n, e) => n + e.workout_sets.filter((set) => set.completed).length,
        0,
      ),
      exercises: s.workout_session_exercises.map((e) => e.exercises?.name).filter(Boolean),
    }));
  },
};

const addExerciseToWorkout: Tool = {
  name: "add_exercise_to_workout",
  title: "Add an exercise to a workout",
  description:
    "Append an exercise to a workout session. The order is assigned from the " +
    "current tail, so concurrent adds cannot collide. Returns the new " +
    "session-exercise id to attach sets to.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sessionId", "exerciseId"],
    properties: {
      sessionId: { type: "string", description: "The workout session uuid." },
      exerciseId: { type: "string", description: "The catalogue exercise uuid (from list_exercises)." },
    },
  },
  handler: async (input, ctx) => {
    const { sessionId, exerciseId } = input as { sessionId: string; exerciseId: string };
    const orderIndex = await tailIndex(ctx, "workout_session_exercises", "order_index", "workout_session_id", sessionId);

    const { data, error } = await ctx.supabase
      .from("workout_session_exercises")
      .insert({ workout_session_id: sessionId, exercise_id: exerciseId, order_index: orderIndex })
      .select("id")
      .single();

    if (error) fail(error.message);
    return { sessionExerciseId: data!.id };
  },
};

const removeExerciseFromWorkout: Tool = {
  name: "remove_exercise_from_workout",
  title: "Remove an exercise from a workout",
  description: "Remove an exercise from a workout. Its sets are deleted with it.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sessionExerciseId"],
    properties: { sessionExerciseId: { type: "string", description: "The session-exercise uuid to remove." } },
  },
  annotations: { destructiveHint: true },
  handler: async (input, { supabase }) => {
    const { sessionExerciseId } = input as { sessionExerciseId: string };
    const { error } = await supabase.from("workout_session_exercises").delete().eq("id", sessionExerciseId);
    if (error) fail(error.message);
    return { removed: true };
  },
};

const addSet: Tool = {
  name: "add_set",
  title: "Add a set",
  description:
    "Append a set to an exercise in a workout, seeded from the previous set -- " +
    "the usual gym pattern of repeating weight and reps. Pass values to " +
    "override the seed.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sessionExerciseId"],
    properties: {
      sessionExerciseId: { type: "string", description: "The session-exercise uuid to add a set to." },
      reps: { type: "integer", minimum: 0, description: "Repetitions. Defaults to the previous set's." },
      weight: { type: "number", minimum: 0, description: "Weight lifted. Defaults to the previous set's." },
      weightUnit: { type: "string", enum: WEIGHT_UNITS, description: "kg or lbs. Defaults to kg when a weight is given." },
    },
  },
  handler: async (input, ctx) => {
    const { sessionExerciseId, reps, weight, weightUnit } = input as {
      sessionExerciseId: string;
      reps?: number;
      weight?: number;
      weightUnit?: "kg" | "lbs";
    };

    const { data: last } = await ctx.supabase
      .from("workout_sets")
      .select("set_index, reps, weight, weight_unit, types")
      .eq("workout_session_exercise_id", sessionExerciseId)
      .order("set_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const resolvedWeight = weight ?? last?.weight ?? null;
    // The DB rejects a weight with no unit; default to kg when a weight exists.
    const resolvedUnit =
      resolvedWeight === null ? null : (weightUnit ?? last?.weight_unit ?? "kg");

    const { data, error } = await ctx.supabase
      .from("workout_sets")
      .insert({
        workout_session_exercise_id: sessionExerciseId,
        set_index: (last?.set_index ?? -1) + 1,
        types: last?.types ?? ["WEIGHT", "REPS"],
        reps: reps ?? last?.reps ?? null,
        weight: resolvedWeight,
        weight_unit: resolvedUnit,
        completed: false,
      })
      .select("id, set_index")
      .single();

    if (error) fail(error.message);
    return { setId: data!.id, setIndex: data!.set_index };
  },
};

const updateSet: Tool = {
  name: "update_set",
  title: "Update a set",
  description:
    "Edit a set's reps, weight, unit or completed flag. Mark it completed once " +
    "it counts toward the log -- only completed sets feed personal records and " +
    "volume.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["setId"],
    properties: {
      setId: { type: "string", description: "The set uuid to update." },
      reps: { type: "integer", minimum: 0, description: "Repetitions." },
      weight: { type: "number", minimum: 0, description: "Weight lifted." },
      weightUnit: { type: "string", enum: WEIGHT_UNITS, description: "kg or lbs; defaults to kg when a weight is set." },
      types: {
        type: "array",
        description: "What the set measures. Defaults are kept if omitted.",
        items: { type: "string", enum: WORKOUT_SET_TYPES },
      },
      completed: { type: "boolean", description: "Whether the set is done." },
    },
  },
  handler: async (input, { supabase }) => {
    const { setId, reps, weight, weightUnit, types, completed } = input as {
      setId: string;
      reps?: number;
      weight?: number;
      weightUnit?: "kg" | "lbs";
      types?: string[];
      completed?: boolean;
    };

    const patch: Record<string, unknown> = {};
    if ("reps" in input) patch.reps = reps;
    if ("weight" in input) {
      patch.weight = weight;
      // weight_needs_unit rejects a weight with no unit; default it here.
      patch.weight_unit = weightUnit ?? "kg";
    } else if (weightUnit) {
      patch.weight_unit = weightUnit;
    }
    if (types) patch.types = types;
    if (completed !== undefined) patch.completed = completed;

    if (Object.keys(patch).length === 0) fail("Nothing to update -- pass at least one field.");

    const { data, error } = await supabase
      .from("workout_sets")
      .update(patch as TablesUpdate<"workout_sets">)
      .eq("id", setId)
      .select("id")
      .maybeSingle();
    if (error) fail(error.message);
    if (!data) fail("No set with that id (it may not be yours).");
    return { updated: true };
  },
};

const deleteSet: Tool = {
  name: "delete_set",
  title: "Delete a set",
  description: "Delete a set from a workout.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["setId"],
    properties: { setId: { type: "string", description: "The set uuid to delete." } },
  },
  annotations: { destructiveHint: true },
  handler: async (input, { supabase }) => {
    const { error } = await supabase.from("workout_sets").delete().eq("id", (input as { setId: string }).setId);
    if (error) fail(error.message);
    return { deleted: true };
  },
};

const finishWorkout: Tool = {
  name: "finish_workout",
  title: "Finish a workout",
  description:
    "End a workout session. The duration is computed server-side from when the " +
    "session started -- the client clock is not trusted. Finishing a workout is " +
    "also what completes a program session, if it belongs to one.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sessionId"],
    properties: { sessionId: { type: "string", description: "The workout session uuid to end." } },
  },
  handler: async (input, { supabase }) => {
    const { sessionId } = input as { sessionId: string };

    const { data: session, error: readError } = await supabase
      .from("workout_sessions")
      .select("started_at, ended_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (readError) fail(readError.message);
    if (!session) fail("Workout not found.");
    if (session.ended_at) fail("That workout is already finished.");

    const durationSeconds = Math.max(
      0,
      Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000),
    );

    const { error } = await supabase
      .from("workout_sessions")
      .update({ ended_at: new Date().toISOString(), duration_seconds: durationSeconds })
      .eq("id", sessionId);

    if (error) fail(error.message);
    return { finished: true, durationSeconds };
  },
};

const rateWorkout: Tool = {
  name: "rate_workout",
  title: "Rate a workout",
  description: "Give a finished workout a rating of 1 to 5, with an optional comment.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["sessionId", "rating"],
    properties: {
      sessionId: { type: "string", description: "The workout session uuid." },
      rating: { type: "integer", minimum: 1, maximum: 5, description: "1 (worst) to 5 (best)." },
      comment: { type: "string", description: "An optional note about the session." },
    },
  },
  handler: async (input, { supabase }) => {
    const { sessionId, rating, comment } = input as { sessionId: string; rating: number; comment?: string };
    const trimmed = comment?.trim();

    const { data, error } = await supabase
      .from("workout_sessions")
      .update({ rating, rating_comment: trimmed || null })
      .eq("id", sessionId)
      .select("id")
      .maybeSingle();

    if (error) fail(error.message);
    if (!data) fail("No workout with that id (it may not be yours).");
    return { rated: true };
  },
};

const getExerciseHistory: Tool = {
  name: "get_exercise_history",
  title: "Get exercise history",
  description:
    "The caller's logged history for one exercise across finished workouts: " +
    "each session's completed sets, top weight and volume, plus the personal " +
    "record. Weights are normalised to kg so a log mixing units still compares.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["exerciseId"],
    properties: {
      exerciseId: { type: "string", description: "The catalogue exercise uuid." },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
  annotations: { readOnlyHint: true },
  handler: async (input, { supabase }) => {
    const { exerciseId, limit = 20 } = input as { exerciseId: string; limit?: number };

    const { data, error } = await supabase
      .from("workout_session_exercises")
      .select("workout_sessions!inner ( id, started_at, ended_at ), workout_sets ( weight, weight_unit, reps, completed )")
      .eq("exercise_id", exerciseId)
      .not("workout_sessions.ended_at", "is", null)
      .order("started_at", { referencedTable: "workout_sessions", ascending: false })
      .limit(limit);

    if (error) fail(error.message);

    const toKg = (w: number | null, unit: "kg" | "lbs" | null) =>
      w === null ? null : unit === "lbs" ? w * LBS_TO_KG : w;

    const entries: { sessionId: string; date: string; topWeightKg: number | null; volumeKg: number; sets: number }[] = [];
    let personalRecordKg: number | null = null;
    let totalSets = 0;

    for (const row of data ?? []) {
      const session = row.workout_sessions;
      if (!session) continue;
      const done = row.workout_sets.filter((s) => s.completed);
      if (done.length === 0) continue;

      const kgs = done.map((s) => toKg(s.weight, s.weight_unit));
      const weights = kgs.filter((w): w is number => w !== null);
      const topWeightKg = weights.length ? Math.max(...weights) : null;
      if (topWeightKg !== null && (personalRecordKg === null || topWeightKg > personalRecordKg)) {
        personalRecordKg = topWeightKg;
      }
      totalSets += done.length;
      entries.push({
        sessionId: session.id,
        date: session.started_at,
        topWeightKg,
        volumeKg: Math.round(done.reduce((sum, s) => sum + (toKg(s.weight, s.weight_unit) ?? 0) * (s.reps ?? 0), 0)),
        sets: done.length,
      });
    }

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { entries, personalRecordKg, totalSets };
  },
};

const getDashboardSummary: Tool = {
  name: "get_dashboard_summary",
  title: "Get dashboard summary",
  description: "Headline totals for the caller: number of sessions, completed sets, and total volume in kg.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  handler: async (_input, { supabase }) => {
    const { count, error: countError } = await supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true });
    if (countError) fail(countError.message);

    const { data: sets, error: setsError } = await supabase
      .from("workout_sets")
      .select("reps, weight, weight_unit")
      .eq("completed", true);
    if (setsError) fail(setsError.message);

    const totalVolume = (sets ?? []).reduce((sum, set) => {
      if (set.reps === null || set.weight === null) return sum;
      const kg = set.weight_unit === "lbs" ? set.weight * LBS_TO_KG : set.weight;
      return sum + kg * set.reps;
    }, 0);

    return {
      totalSessions: count ?? 0,
      completedSets: sets?.length ?? 0,
      totalVolumeKg: Math.round(totalVolume),
    };
  },
};

export const workoutTools: Tool[] = [
  startWorkout,
  getActiveWorkout,
  getWorkout,
  listRecentWorkouts,
  addExerciseToWorkout,
  removeExerciseFromWorkout,
  addSet,
  updateSet,
  deleteSet,
  finishWorkout,
  rateWorkout,
  getExerciseHistory,
  getDashboardSummary,
];
