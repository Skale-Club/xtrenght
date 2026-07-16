import "server-only";

import { getExerciseBySlug, listExercises } from "@/entities/exercise/api/exercise-queries";
import { listPrograms, getProgramBySlug } from "@/entities/program/api/program-queries";
import {
  getExerciseHistory,
  getSessionSummary,
  listRecentSessions,
} from "@/entities/workout/api/workout-queries";
import type { Enums } from "@/shared/types/database.types";

/**
 * Tools the coach can call.
 *
 * Every one of these delegates to an existing entity query, and those queries
 * use the request-scoped Supabase client -- the one carrying the signed-in
 * user's JWT. So the model's reads are RLS-scoped exactly like the browser's:
 * asking for "Bob's workouts" returns this user's workouts or nothing, because
 * Postgres will not serve anything else. There is no tool here that could leak
 * across users even if the model were told to.
 *
 * None of them take a user id. That is deliberate -- a user-id parameter would
 * be a lever for the model to pull, and there is nothing to gain by offering it
 * one that the database would refuse anyway.
 */

// OpenRouter speaks the OpenAI function-calling shape.
export const COACH_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_exercises",
      description:
        "Search the exercise catalogue by name and/or filter by muscle. Use this to find exercises to suggest, or to resolve an exercise the user names loosely ('bench', 'squats') into a real catalogue entry with a slug.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Name fragment, e.g. 'bench press'." },
          muscles: {
            type: "array",
            description: "Filter to exercises whose PRIMARY muscle is one of these.",
            items: {
              type: "string",
              enum: [
                "CHEST", "BACK", "LATS", "TRAPS", "LOWER_BACK", "MIDDLE_BACK", "SHOULDERS",
                "BICEPS", "TRICEPS", "FOREARMS", "QUADRICEPS", "HAMSTRINGS", "GLUTES",
                "CALVES", "ABDOMINALS", "OBLIQUES", "ADDUCTORS", "ABDUCTORS", "NECK",
                "FULL_BODY", "ROTATOR_CUFF", "HIP_FLEXOR", "ACHILLES_TENDON", "FINGERS",
              ],
            },
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_exercise_details",
      description:
        "Full details for one exercise: muscles, equipment, force, difficulty, and how to perform it. Call after search_exercises when the user asks how to do something.",
      parameters: {
        type: "object",
        properties: { slug: { type: "string", description: "Exercise slug from search_exercises." } },
        required: ["slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_exercise_history",
      description:
        "This user's logged history for ONE exercise: every session they did it, the sets, and their personal record. This is how you answer 'what's my bench PR' or 'am I getting stronger at X'. Never estimate these numbers -- read them.",
      parameters: {
        type: "object",
        properties: { slug: { type: "string", description: "Exercise slug from search_exercises." } },
        required: ["slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_workouts",
      description:
        "This user's recent workouts, newest first: when, which exercises, which sets, and whether each is finished. Use it for 'what did I do last week', to see training frequency, or to check what they hit recently before suggesting today's session.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "How many workouts. Default 10, max 30." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_training_summary",
      description:
        "Headline totals for this user: sessions logged, sets completed, total volume in kg. Cheap -- call it early when you need a sense of how much they train.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_programs",
      description: "The published training programs available to follow.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_program_progress",
      description:
        "One program's full structure plus this user's progress through it: which sessions are done, which is next, and what each prescribes. Use it when they ask what to do today and they're following a program.",
      parameters: {
        type: "object",
        properties: { slug: { type: "string", description: "Program slug from list_programs." } },
        required: ["slug"],
      },
    },
  },
];

/** Trims a tool result to what the model can use. Full rows would be mostly noise. */
function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function round(kg: number) {
  return Math.round(kg * 10) / 10;
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Runs one tool call.
 *
 * Returns errors as values rather than throwing: a failed tool should tell the
 * model what went wrong so it can adjust, not kill the turn.
 */
export async function runCoachTool(name: string, rawArgs: string): Promise<ToolResult> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, error: "Arguments were not valid JSON." };
  }

  try {
    switch (name) {
      case "search_exercises": {
        const { exercises, total } = await listExercises({
          search: typeof args.search === "string" ? args.search : undefined,
          muscles: Array.isArray(args.muscles) ? (args.muscles as Enums<"muscle_group">[]) : undefined,
          perPage: 12,
        });

        return {
          ok: true,
          data: {
            total_matches: total,
            showing: exercises.length,
            exercises: exercises.map((e) => ({
              slug: e.slug,
              name: e.name,
              primary_muscles: e.primary_muscles.map(label),
              equipment: e.equipment.map(label),
              level: e.level ? label(e.level) : null,
            })),
          },
        };
      }

      case "get_exercise_details": {
        const slug = String(args.slug ?? "");
        const exercise = await getExerciseBySlug(slug);
        if (!exercise) return { ok: false, error: `No exercise with slug "${slug}".` };

        return {
          ok: true,
          data: {
            slug: exercise.slug,
            name: exercise.name,
            primary_muscles: exercise.primary_muscles.map(label),
            secondary_muscles: exercise.secondary_muscles.map(label),
            equipment: exercise.equipment.map(label),
            type: exercise.exercise_types.map(label),
            force: exercise.force ? label(exercise.force) : null,
            level: exercise.level ? label(exercise.level) : null,
            mechanics: exercise.mechanics ? label(exercise.mechanics) : null,
            // Strip the dataset's HTML. It is reference text from a third
            // party -- and text the model reads is text that can try to
            // instruct it, so give it the prose and not the markup.
            how_to: exercise.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null,
          },
        };
      }

      case "get_exercise_history": {
        const slug = String(args.slug ?? "");
        const exercise = await getExerciseBySlug(slug);
        if (!exercise) return { ok: false, error: `No exercise with slug "${slug}".` };

        const history = await getExerciseHistory(exercise.id);

        return {
          ok: true,
          data: {
            exercise: exercise.name,
            personal_record_kg: history.personalRecordKg ? round(history.personalRecordKg) : null,
            total_sets_logged: history.totalSets,
            sessions: history.entries.map((entry) => ({
              date: entry.date.slice(0, 10),
              top_set_kg: entry.topWeightKg ? round(entry.topWeightKg) : null,
              volume_kg: round(entry.volumeKg),
              sets: entry.sets.map((s) => ({
                weight_kg: s.weightKg ? round(s.weightKg) : null,
                reps: s.reps,
              })),
            })),
          },
        };
      }

      case "get_recent_workouts": {
        const limit = Math.min(Number(args.limit) || 10, 30);
        const sessions = await listRecentSessions(limit);

        return {
          ok: true,
          data: {
            workouts: sessions.map((session) => ({
              date: session.started_at.slice(0, 10),
              finished: session.ended_at !== null,
              duration_min: session.duration_seconds
                ? Math.round(session.duration_seconds / 60)
                : null,
              rating: session.rating,
              exercises: session.workout_session_exercises.map((e) => ({
                name: e.exercises?.name ?? "unknown",
                sets: e.workout_sets
                  .filter((s) => s.completed)
                  .map((s) => ({
                    weight: s.weight,
                    unit: s.weight_unit,
                    reps: s.reps,
                  })),
              })),
            })),
          },
        };
      }

      case "get_training_summary": {
        const summary = await getSessionSummary();
        return {
          ok: true,
          data: {
            sessions_logged: summary.totalSessions,
            sets_completed: summary.completedSets,
            total_volume_kg: summary.totalVolume,
          },
        };
      }

      case "list_programs": {
        const programs = await listPrograms();
        return {
          ok: true,
          data: {
            programs: programs
              .filter((p) => p.visibility === "PUBLISHED")
              .map((p) => ({
                slug: p.slug,
                title: p.title,
                level: label(p.level),
                weeks: p.weekCount,
                sessions: p.sessionCount,
              })),
          },
        };
      }

      case "get_program_progress": {
        const slug = String(args.slug ?? "");
        const program = await getProgramBySlug(slug);
        if (!program) return { ok: false, error: `No program with slug "${slug}".` };

        const nextId = program.progress.nextSessionId;

        return {
          ok: true,
          data: {
            program: program.title,
            following: program.enrollment !== null,
            sessions_done: program.progress.completedCount,
            sessions_total: program.progress.totalCount,
            weeks: program.program_weeks.map((week) => ({
              week: week.week_number,
              sessions: week.program_sessions.map((session) => ({
                title: session.title,
                state: program.progress.stateOf(session.id),
                is_next: session.id === nextId,
                exercises: session.program_session_exercises.map((e) => ({
                  name: e.exercises?.name ?? "unknown",
                  prescribed: e.program_suggested_sets.map((s) => ({
                    weight: s.weight,
                    unit: s.weight_unit,
                    reps: s.reps,
                  })),
                })),
              })),
            })),
          },
        };
      }

      default:
        return { ok: false, error: `Unknown tool "${name}".` };
    }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Tool failed." };
  }
}
