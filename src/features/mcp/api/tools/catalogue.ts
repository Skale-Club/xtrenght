import type { Tool } from "@/features/mcp/api/tools/types";
import { fail } from "@/features/mcp/api/tools/types";
import { EQUIPMENT, MUSCLE_GROUPS } from "@/features/mcp/api/tools/enums";

/**
 * Read tools over the public catalogue: exercises and published programs.
 *
 * These lean on the same RLS policies the web pages do. An unpublished exercise
 * or a draft program is simply not returned to a non-admin, so there is no
 * visibility filter here to keep in sync -- the database applies it.
 */

const whoami: Tool = {
  name: "whoami",
  title: "Who am I",
  description:
    "Return the signed-in user's id, email, display name and role. Call this " +
    "first to confirm the connection is authenticated and whether the account " +
    "has admin rights (needed for the program-authoring tools).",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  handler: async (_input, { supabase, user }) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: user.email ?? null,
      displayName: profile?.display_name ?? null,
      role: profile?.role ?? "user",
      isAdmin: profile?.role === "admin",
    };
  },
};

const listExercises: Tool = {
  name: "list_exercises",
  title: "List exercises",
  description:
    "Search and filter the exercise catalogue. Combine a name search with " +
    "muscle and equipment filters; results are paginated. Use the returned " +
    "`id` to add an exercise to a workout or a program session.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      search: { type: "string", description: "Case-insensitive substring of the exercise name." },
      muscles: {
        type: "array",
        description: "Keep exercises whose primary muscles include any of these.",
        items: { type: "string", enum: MUSCLE_GROUPS },
      },
      equipment: {
        type: "array",
        description: "Keep exercises using any of this equipment.",
        items: { type: "string", enum: EQUIPMENT },
      },
      page: { type: "integer", minimum: 1, default: 1 },
      perPage: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
  annotations: { readOnlyHint: true },
  handler: async (input, { supabase }) => {
    const { search, muscles, equipment, page = 1, perPage = 20 } = input as {
      search?: string;
      muscles?: string[];
      equipment?: string[];
      page?: number;
      perPage?: number;
    };

    let query = supabase
      .from("exercises")
      .select("id, name, slug, primary_muscles, secondary_muscles, equipment, level, mechanics", {
        count: "exact",
      });

    if (search) query = query.ilike("name", `%${search}%`);
    if (muscles?.length) query = query.overlaps("primary_muscles", muscles);
    if (equipment?.length) query = query.overlaps("equipment", equipment);

    const from = (page - 1) * perPage;
    const { data, count, error } = await query.order("name").range(from, from + perPage - 1);

    if (error) fail(error.message);

    const total = count ?? 0;
    return {
      exercises: data,
      page,
      perPage,
      total,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
    };
  },
};

const getExercise: Tool = {
  name: "get_exercise",
  title: "Get an exercise",
  description: "Fetch one exercise in full by its slug or id, including its description and images.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      slug: { type: "string", description: "The exercise slug, e.g. 'barbell-bench-press'." },
      id: { type: "string", description: "The exercise uuid. Give either this or `slug`." },
    },
  },
  annotations: { readOnlyHint: true },
  handler: async (input, { supabase }) => {
    const { slug, id } = input as { slug?: string; id?: string };
    if (!slug && !id) fail("Pass either `slug` or `id`.");

    const query = supabase.from("exercises").select("*");
    const { data, error } = await (slug ? query.eq("slug", slug) : query.eq("id", id!)).maybeSingle();

    if (error) fail(error.message);
    if (!data) fail("No exercise matches that slug or id.");
    return data;
  },
};

const listPrograms: Tool = {
  name: "list_programs",
  title: "List training programs",
  description:
    "List training programs with their week and session counts. Published " +
    "programs are visible to everyone; an admin also sees their own drafts.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  handler: async (_input, { supabase }) => {
    const { data, error } = await supabase
      .from("programs")
      .select("id, slug, title, description, level, category, visibility, participant_count, program_weeks (id, program_sessions (id))")
      .order("created_at", { ascending: false });

    if (error) fail(error.message);

    return (data ?? []).map((program) => {
      const { program_weeks, ...rest } = program;
      return {
        ...rest,
        weekCount: program_weeks.length,
        sessionCount: program_weeks.reduce((n, w) => n + w.program_sessions.length, 0),
      };
    });
  },
};

const getProgram: Tool = {
  name: "get_program",
  title: "Get a training program",
  description:
    "Fetch a program's full tree -- weeks, sessions, their exercises and the " +
    "suggested sets for each. Address it by slug or id. Drafts resolve only " +
    "for an admin. Use this to inspect a plan before editing it.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      slug: { type: "string", description: "The program slug." },
      id: { type: "string", description: "The program uuid. Give either this or `slug`." },
    },
  },
  annotations: { readOnlyHint: true },
  handler: async (input, { supabase }) => {
    const { slug, id } = input as { slug?: string; id?: string };
    if (!slug && !id) fail("Pass either `slug` or `id`.");

    const query = supabase.from("programs").select(
      `
      id, slug, title, description, category, image_url, level, equipment,
      session_duration_min, visibility, participant_count,
      program_weeks (
        id, week_number, title, description,
        program_sessions (
          id, session_number, slug, title, description, estimated_minutes,
          program_session_exercises (
            id, order_index, instructions,
            exercises ( id, name, slug ),
            program_suggested_sets ( id, set_index, types, reps, weight, weight_unit, duration_seconds )
          )
        )
      )
    `,
    );

    const { data, error } = await (slug ? query.eq("slug", slug) : query.eq("id", id!)).maybeSingle();

    if (error) fail(error.message);
    if (!data) fail("No program matches that slug or id (drafts are admin-only).");

    // PostgREST cannot order embedded rows; sort the tree the way the app does.
    data.program_weeks.sort((a, b) => a.week_number - b.week_number);
    for (const week of data.program_weeks) {
      week.program_sessions.sort((a, b) => a.session_number - b.session_number);
      for (const session of week.program_sessions) {
        session.program_session_exercises.sort((a, b) => a.order_index - b.order_index);
        for (const exercise of session.program_session_exercises) {
          exercise.program_suggested_sets.sort((a, b) => a.set_index - b.set_index);
        }
      }
    }
    return data;
  },
};

export const catalogueTools: Tool[] = [whoami, listExercises, getExercise, listPrograms, getProgram];
