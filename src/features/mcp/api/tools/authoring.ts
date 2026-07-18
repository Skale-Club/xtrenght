import type { PostgrestError } from "@supabase/supabase-js";

import type { TablesUpdate } from "@/shared/types/database.types";
import type { Tool, ToolContext } from "@/features/mcp/api/tools/types";
import { fail } from "@/features/mcp/api/tools/types";
import { EQUIPMENT, PROGRAM_LEVELS, PROGRAM_VISIBILITIES, WEIGHT_UNITS, WORKOUT_SET_TYPES } from "@/features/mcp/api/tools/enums";

/**
 * Program authoring: create and shape the template tree that members later
 * follow. Every tool here writes to a table whose RLS policy is `is_admin()`,
 * so the authorization check is the database's, not this file's.
 *
 * A non-admin caller hits that wall in one of two ways. An insert is refused
 * outright (Postgres error 42501). An update or delete instead matches no rows
 * -- the policy makes them invisible -- so it silently changes nothing; these
 * tools detect the empty result and say so rather than reporting a false
 * success.
 */

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A readable message for the failures these tools provoke on purpose. */
function translate(error: PostgrestError): string {
  if (error.code === "42501") return "This needs admin rights, which this account does not have.";
  return error.message;
}

/** RLS hides a forbidden row, so update/delete return no error and no rows. */
function notPermitted(action: string): never {
  fail(`Nothing was ${action}: the record does not exist, or this account lacks admin rights to change it.`);
}

async function tail(ctx: ToolContext, table: "program_weeks" | "program_sessions" | "program_session_exercises" | "program_suggested_sets", column: string, parentColumn: string, parentId: string) {
  const { data } = await ctx.supabase
    .from(table)
    .select(column)
    .eq(parentColumn, parentId)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, number> | null)?.[column] ?? null;
}

// ------------------------------------------------------------------ programs --

const createProgram: Tool = {
  name: "create_program",
  title: "Create a program",
  description:
    "Create a new training program. It starts as a DRAFT (invisible to " +
    "non-admins) with no weeks -- add weeks, sessions and exercises, then " +
    "publish with set_program_visibility. The slug is derived from the title. " +
    "Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, description: "The program's name." },
      description: { type: "string" },
      category: { type: "string", description: "A free-text grouping, e.g. 'Strength' or 'Hypertrophy'." },
      level: { type: "string", enum: PROGRAM_LEVELS, default: "BEGINNER" },
      image_url: { type: "string" },
      session_duration_min: { type: "integer", minimum: 0, description: "Typical session length in minutes." },
      equipment: { type: "array", items: { type: "string", enum: EQUIPMENT }, description: "Equipment the program assumes." },
    },
  },
  handler: async (input, { supabase }) => {
    const values = input as {
      title: string;
      description?: string;
      category?: string;
      level?: string;
      image_url?: string;
      session_duration_min?: number;
      equipment?: string[];
    };
    const title = values.title.trim();
    const slug = slugify(title);
    if (!slug) fail("That title produces an empty slug -- give it some letters or digits.");

    const { data, error } = await supabase
      .from("programs")
      .insert({
        title,
        slug,
        level: (values.level ?? "BEGINNER") as never,
        description: values.description?.trim() || null,
        category: values.category?.trim() || null,
        image_url: values.image_url?.trim() || null,
        session_duration_min: values.session_duration_min ?? null,
        equipment: (values.equipment ?? []) as never,
      })
      .select("id, slug, visibility")
      .single();

    if (error) {
      if (error.code === "23505") fail("A program with that title already exists.");
      fail(translate(error));
    }
    return { programId: data!.id, slug: data!.slug, visibility: data!.visibility };
  },
};

const updateProgram: Tool = {
  name: "update_program",
  title: "Update a program",
  description: "Edit a program's title, description, level and other top-level fields. Only the fields you pass change. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programId"],
    properties: {
      programId: { type: "string" },
      title: { type: "string", minLength: 1 },
      description: { type: "string" },
      category: { type: "string" },
      level: { type: "string", enum: PROGRAM_LEVELS },
      image_url: { type: "string" },
      session_duration_min: { type: "integer", minimum: 0 },
      equipment: { type: "array", items: { type: "string", enum: EQUIPMENT } },
    },
  },
  handler: async (input, { supabase }) => {
    const { programId, ...fields } = input as Record<string, unknown> & { programId: string };
    const patch: Record<string, unknown> = {};
    if ("title" in fields) patch.title = String(fields.title).trim();
    if ("description" in fields) patch.description = String(fields.description ?? "").trim() || null;
    if ("category" in fields) patch.category = String(fields.category ?? "").trim() || null;
    if ("level" in fields) patch.level = fields.level;
    if ("image_url" in fields) patch.image_url = String(fields.image_url ?? "").trim() || null;
    if ("session_duration_min" in fields) patch.session_duration_min = fields.session_duration_min;
    if ("equipment" in fields) patch.equipment = fields.equipment;

    if (Object.keys(patch).length === 0) fail("Nothing to update -- pass at least one field.");

    const { data, error } = await supabase
      .from("programs")
      .update(patch as TablesUpdate<"programs">)
      .eq("id", programId)
      .select("id")
      .maybeSingle();
    if (error) fail(translate(error));
    if (!data) notPermitted("updated");
    return { updated: true };
  },
};

const setProgramVisibility: Tool = {
  name: "set_program_visibility",
  title: "Set program visibility",
  description:
    "Move a program between DRAFT (admin-only), PUBLISHED (visible to everyone, " +
    "and followable) and ARCHIVED. Publishing is how a finished program goes " +
    "live. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programId", "visibility"],
    properties: {
      programId: { type: "string" },
      visibility: { type: "string", enum: PROGRAM_VISIBILITIES },
    },
  },
  handler: async (input, { supabase }) => {
    const { programId, visibility } = input as { programId: string; visibility: string };
    const { data, error } = await supabase
      .from("programs")
      .update({ visibility: visibility as never })
      .eq("id", programId)
      .select("id, visibility")
      .maybeSingle();
    if (error) fail(translate(error));
    if (!data) notPermitted("changed");
    return { visibility: data.visibility };
  },
};

const deleteProgram: Tool = {
  name: "delete_program",
  title: "Delete a program",
  description:
    "Delete a program and its whole tree (weeks, sessions, exercises, suggested " +
    "sets) plus enrollments. Workouts people already logged are kept -- their " +
    "history survives. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programId"],
    properties: { programId: { type: "string" } },
  },
  annotations: { destructiveHint: true },
  handler: async (input, { supabase }) => {
    const { data, error } = await supabase
      .from("programs")
      .delete()
      .eq("id", (input as { programId: string }).programId)
      .select("id")
      .maybeSingle();
    if (error) fail(translate(error));
    if (!data) notPermitted("deleted");
    return { deleted: true };
  },
};

// --------------------------------------------------------------------- weeks --

const addProgramWeek: Tool = {
  name: "add_program_week",
  title: "Add a week",
  description: "Append a week to a program. Weeks are numbered from the current tail. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programId"],
    properties: {
      programId: { type: "string" },
      title: { type: "string", description: "An optional week label, e.g. 'Deload'." },
      description: { type: "string" },
    },
  },
  handler: async (input, ctx) => {
    const { programId, title, description } = input as { programId: string; title?: string; description?: string };
    const last = await tail(ctx, "program_weeks", "week_number", "program_id", programId);

    const { data, error } = await ctx.supabase
      .from("program_weeks")
      .insert({
        program_id: programId,
        week_number: (last ?? 0) + 1,
        title: title?.trim() || null,
        description: description?.trim() || null,
      })
      .select("id, week_number")
      .single();

    if (error) fail(translate(error));
    return { weekId: data!.id, weekNumber: data!.week_number };
  },
};

const deleteProgramWeek: Tool = {
  name: "delete_program_week",
  title: "Delete a week",
  description: "Delete a week and everything under it. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["weekId"],
    properties: { weekId: { type: "string" } },
  },
  annotations: { destructiveHint: true },
  handler: async (input, { supabase }) => {
    const { data, error } = await supabase
      .from("program_weeks")
      .delete()
      .eq("id", (input as { weekId: string }).weekId)
      .select("id")
      .maybeSingle();
    if (error) fail(translate(error));
    if (!data) notPermitted("deleted");
    return { deleted: true };
  },
};

// ------------------------------------------------------------------ sessions --

const addProgramSession: Tool = {
  name: "add_program_session",
  title: "Add a session to a week",
  description:
    "Add a training session (a workout day) to a week. Numbered from the tail; " +
    "the slug is derived from the title and unique within the week. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["weekId", "title"],
    properties: {
      weekId: { type: "string" },
      title: { type: "string", minLength: 1, description: "e.g. 'Push Day' or 'Day 1 - Lower'." },
      description: { type: "string" },
      estimated_minutes: { type: "integer", minimum: 0 },
    },
  },
  handler: async (input, ctx) => {
    const { weekId, title, description, estimated_minutes } = input as {
      weekId: string;
      title: string;
      description?: string;
      estimated_minutes?: number;
    };
    const trimmed = title.trim();
    if (!trimmed) fail("Give the session a title.");

    const last = await tail(ctx, "program_sessions", "session_number", "week_id", weekId);
    const sessionNumber = (last ?? 0) + 1;
    const slug = slugify(trimmed) || `session-${sessionNumber}`;

    const { data, error } = await ctx.supabase
      .from("program_sessions")
      .insert({
        week_id: weekId,
        session_number: sessionNumber,
        title: trimmed,
        slug,
        description: description?.trim() || null,
        estimated_minutes: estimated_minutes ?? null,
      })
      .select("id, session_number, slug")
      .single();

    if (error) {
      if (error.code === "23505") fail("That session name is already taken in this week.");
      fail(translate(error));
    }
    return { programSessionId: data!.id, sessionNumber: data!.session_number, slug: data!.slug };
  },
};

const deleteProgramSession: Tool = {
  name: "delete_program_session",
  title: "Delete a session",
  description: "Delete a program session and its exercises. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programSessionId"],
    properties: { programSessionId: { type: "string" } },
  },
  annotations: { destructiveHint: true },
  handler: async (input, { supabase }) => {
    const { data, error } = await supabase
      .from("program_sessions")
      .delete()
      .eq("id", (input as { programSessionId: string }).programSessionId)
      .select("id")
      .maybeSingle();
    if (error) fail(translate(error));
    if (!data) notPermitted("deleted");
    return { deleted: true };
  },
};

// -------------------------------------------------------- session exercises --

const addExerciseToProgramSession: Tool = {
  name: "add_exercise_to_program_session",
  title: "Add an exercise to a session",
  description:
    "Add a catalogue exercise to a program session, appended after the others. " +
    "One suggested set (8 reps) is seeded so the exercise has a prescription to " +
    "edit. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programSessionId", "exerciseId"],
    properties: {
      programSessionId: { type: "string" },
      exerciseId: { type: "string", description: "The catalogue exercise uuid (from list_exercises)." },
      instructions: { type: "string", description: "An optional coaching note for this exercise in this session." },
    },
  },
  handler: async (input, ctx) => {
    const { programSessionId, exerciseId, instructions } = input as {
      programSessionId: string;
      exerciseId: string;
      instructions?: string;
    };
    const last = await tail(ctx, "program_session_exercises", "order_index", "program_session_id", programSessionId);

    const { data, error } = await ctx.supabase
      .from("program_session_exercises")
      .insert({
        program_session_id: programSessionId,
        exercise_id: exerciseId,
        order_index: (last ?? -1) + 1,
        instructions: instructions?.trim() || null,
      })
      .select("id")
      .single();

    if (error) fail(translate(error));

    // An exercise with no prescription is not useful; seed one set to edit.
    const { data: set, error: setError } = await ctx.supabase
      .from("program_suggested_sets")
      .insert({ program_session_exercise_id: data!.id, set_index: 0, types: ["WEIGHT", "REPS"], reps: 8 })
      .select("id")
      .single();

    if (setError) fail(translate(setError));
    return { programSessionExerciseId: data!.id, seededSetId: set!.id };
  },
};

const removeExerciseFromProgramSession: Tool = {
  name: "remove_exercise_from_program_session",
  title: "Remove an exercise from a session",
  description: "Remove an exercise (and its suggested sets) from a program session. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programSessionExerciseId"],
    properties: { programSessionExerciseId: { type: "string" } },
  },
  annotations: { destructiveHint: true },
  handler: async (input, { supabase }) => {
    const { data, error } = await supabase
      .from("program_session_exercises")
      .delete()
      .eq("id", (input as { programSessionExerciseId: string }).programSessionExerciseId)
      .select("id")
      .maybeSingle();
    if (error) fail(translate(error));
    if (!data) notPermitted("removed");
    return { removed: true };
  },
};

// ---------------------------------------------------------- suggested sets --

const addSuggestedSet: Tool = {
  name: "add_suggested_set",
  title: "Add a suggested set",
  description:
    "Append a suggested set to a program exercise, seeded from the previous one. " +
    "Pass fields to override. Suggested sets are the prescription copied into a " +
    "member's workout when they start the session. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programSessionExerciseId"],
    properties: {
      programSessionExerciseId: { type: "string" },
      reps: { type: "integer", minimum: 0 },
      weight: { type: "number", minimum: 0 },
      weightUnit: { type: "string", enum: WEIGHT_UNITS },
      types: { type: "array", items: { type: "string", enum: WORKOUT_SET_TYPES } },
      duration_seconds: { type: "integer", minimum: 0, description: "For timed sets." },
    },
  },
  handler: async (input, ctx) => {
    const { programSessionExerciseId, reps, weight, weightUnit, types, duration_seconds } = input as {
      programSessionExerciseId: string;
      reps?: number;
      weight?: number;
      weightUnit?: "kg" | "lbs";
      types?: string[];
      duration_seconds?: number;
    };

    const { data: last } = await ctx.supabase
      .from("program_suggested_sets")
      .select("set_index, types, reps, weight, weight_unit")
      .eq("program_session_exercise_id", programSessionExerciseId)
      .order("set_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const resolvedWeight = weight ?? last?.weight ?? null;
    // weight_needs_unit rejects a weight with no unit.
    const resolvedUnit = resolvedWeight === null ? null : (weightUnit ?? last?.weight_unit ?? "kg");

    const { data, error } = await ctx.supabase
      .from("program_suggested_sets")
      .insert({
        program_session_exercise_id: programSessionExerciseId,
        set_index: (last?.set_index ?? -1) + 1,
        types: (types ?? last?.types ?? ["WEIGHT", "REPS"]) as never,
        reps: reps ?? last?.reps ?? 8,
        weight: resolvedWeight,
        weight_unit: resolvedUnit,
        duration_seconds: duration_seconds ?? null,
      })
      .select("id, set_index")
      .single();

    if (error) fail(translate(error));
    return { suggestedSetId: data!.id, setIndex: data!.set_index };
  },
};

const updateSuggestedSet: Tool = {
  name: "update_suggested_set",
  title: "Update a suggested set",
  description: "Edit a suggested set's reps, weight, unit, types or duration. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["suggestedSetId"],
    properties: {
      suggestedSetId: { type: "string" },
      reps: { type: "integer", minimum: 0 },
      weight: { type: "number", minimum: 0 },
      weightUnit: { type: "string", enum: WEIGHT_UNITS },
      types: { type: "array", items: { type: "string", enum: WORKOUT_SET_TYPES } },
      duration_seconds: { type: "integer", minimum: 0 },
    },
  },
  handler: async (input, { supabase }) => {
    const { suggestedSetId, reps, weight, weightUnit, types, duration_seconds } = input as {
      suggestedSetId: string;
      reps?: number;
      weight?: number;
      weightUnit?: "kg" | "lbs";
      types?: string[];
      duration_seconds?: number;
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
    if ("duration_seconds" in input) patch.duration_seconds = duration_seconds;

    if (Object.keys(patch).length === 0) fail("Nothing to update -- pass at least one field.");

    const { data, error } = await supabase
      .from("program_suggested_sets")
      .update(patch as TablesUpdate<"program_suggested_sets">)
      .eq("id", suggestedSetId)
      .select("id")
      .maybeSingle();
    if (error) fail(translate(error));
    if (!data) notPermitted("updated");
    return { updated: true };
  },
};

const deleteSuggestedSet: Tool = {
  name: "delete_suggested_set",
  title: "Delete a suggested set",
  description: "Delete a suggested set from a program exercise. Admin only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["suggestedSetId"],
    properties: { suggestedSetId: { type: "string" } },
  },
  annotations: { destructiveHint: true },
  handler: async (input, { supabase }) => {
    const { data, error } = await supabase
      .from("program_suggested_sets")
      .delete()
      .eq("id", (input as { suggestedSetId: string }).suggestedSetId)
      .select("id")
      .maybeSingle();
    if (error) fail(translate(error));
    if (!data) notPermitted("deleted");
    return { deleted: true };
  },
};

export const authoringTools: Tool[] = [
  createProgram,
  updateProgram,
  setProgramVisibility,
  deleteProgram,
  addProgramWeek,
  deleteProgramWeek,
  addProgramSession,
  deleteProgramSession,
  addExerciseToProgramSession,
  removeExerciseFromProgramSession,
  addSuggestedSet,
  updateSuggestedSet,
  deleteSuggestedSet,
];
