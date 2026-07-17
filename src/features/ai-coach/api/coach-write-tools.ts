import "server-only";

import { getExerciseBySlug } from "@/entities/exercise/api/exercise-queries";
import { getProgramBySlug } from "@/entities/program/api/program-queries";
import { createClient } from "@/shared/lib/supabase/server";
import type { Enums } from "@/shared/types/database.types";

/**
 * Tools that change something.
 *
 * Two rules hold every one of these together:
 *
 * 1. **They run under the user's JWT**, like the read tools. RLS and every
 *    constraint still apply, so a hallucinated "you benched 300 kg" is refused
 *    by `workout_sets_weight_needs_unit` and the ownership policy before it can
 *    become a row. The model proposes; Postgres decides.
 *
 * 2. **They do not run until the user taps confirm.** The route stops when one
 *    is called, hands the proposal to the UI, and only executes on the way
 *    back. See the `confirm` handling in the chat route.
 *
 * Rule 2 is the interesting one. Rule 1 protects against invalid data; it does
 * nothing about *valid data the user didn't want*. Starting a workout they
 * didn't ask for breaks no constraint at all.
 */

export const COACH_WRITE_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "start_workout",
      description:
        "Start a new workout session for the user, optionally pre-filled with exercises. Use when they say they're training now. If they already have an unfinished workout this returns that one instead of starting a second.",
      parameters: {
        type: "object",
        properties: {
          exercise_slugs: {
            type: "array",
            description: "Exercises to add, in order. Get slugs from search_exercises.",
            items: { type: "string" },
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_exercise_to_workout",
      description: "Add one exercise to the user's current unfinished workout.",
      parameters: {
        type: "object",
        properties: { slug: { type: "string", description: "Exercise slug." } },
        required: ["slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_prescription",
      description:
        "Set the planned sets for one exercise in the user's current workout — not yet completed. This is how you apply a plan or an adjustment: read their history first, then prescribe. Replaces whatever sets that exercise currently has. Most exercises are reps (with optional weight); isometrics and holds — planks, wall sits, static stretches — are timed instead. get_exercise_details tells you which: a static force or a stretching/stabilization type is held for time, so prescribe hold_seconds, not reps.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Exercise slug, already in the workout." },
          sets: {
            type: "array",
            description: "One entry per set, in order.",
            items: {
              type: "object",
              properties: {
                weight_kg: { type: "number", description: "Omit for bodyweight." },
                reps: { type: "integer", description: "For a reps-based set. Give this OR hold_seconds, not both." },
                hold_seconds: {
                  type: "integer",
                  description: "For a timed hold (plank, isometric, stretch): seconds to hold. Use instead of reps.",
                },
              },
            },
          },
        },
        required: ["slug", "sets"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "follow_program",
      description: "Enrol the user in a training program so they can follow it.",
      parameters: {
        type: "object",
        properties: { slug: { type: "string", description: "Program slug from list_programs." } },
        required: ["slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_coach_note",
      description:
        "Remember one durable fact about this user for future conversations — a preference, a constraint, an injury, how they respond to training. Not for things you can read with a tool (their PR is not a note). One fact per note, written so it makes sense months later without this conversation.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string", description: "One short sentence." },
        },
        required: ["note"],
      },
    },
  },
];

export const WRITE_TOOL_NAMES = new Set(COACH_WRITE_TOOLS.map((t) => t.function.name));

/** A one-line, human-readable version of what the model wants to do. */
export function describeWrite(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "start_workout": {
      const slugs = Array.isArray(args.exercise_slugs) ? args.exercise_slugs : [];
      return slugs.length
        ? `Start a workout with ${slugs.length} exercise${slugs.length === 1 ? "" : "s"}`
        : "Start an empty workout";
    }
    case "add_exercise_to_workout":
      return `Add ${String(args.slug ?? "an exercise").replace(/-/g, " ")} to your workout`;
    case "set_prescription": {
      const sets = Array.isArray(args.sets) ? args.sets : [];
      const name = String(args.slug ?? "exercise").replace(/-/g, " ");
      const first = sets[0] as { weight_kg?: number; reps?: number; hold_seconds?: number } | undefined;
      const uniform = sets.every(
        (s) =>
          (s as { weight_kg?: number }).weight_kg === first?.weight_kg &&
          (s as { reps?: number }).reps === first?.reps &&
          (s as { hold_seconds?: number }).hold_seconds === first?.hold_seconds,
      );
      let shape = `${sets.length} sets`;
      if (uniform && first) {
        shape =
          typeof first.hold_seconds === "number"
            ? `${sets.length} × ${first.hold_seconds}s`
            : `${sets.length} × ${first.reps}${first.weight_kg ? ` @ ${first.weight_kg}kg` : ""}`;
      }
      return `Plan ${shape} of ${name}`;
    }
    case "follow_program":
      return `Follow the ${String(args.slug ?? "program").replace(/-/g, " ")} program`;
    case "save_coach_note":
      return `Remember: "${String(args.note ?? "")}"`;
    default:
      return name;
  }
}

export type WriteResult = { ok: true; data: unknown } | { ok: false; error: string };

/** The user's open workout, if any. Write tools need one to act on. */
async function currentWorkout() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_sessions")
    .select("id")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Runs an approved write. Only called after the user confirms. */
export async function runCoachWrite(name: string, rawArgs: string): Promise<WriteResult> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, error: "Arguments were not valid JSON." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not signed in." };

  try {
    switch (name) {
      case "start_workout": {
        // Reuse an open session rather than stacking a second one, same as the
        // Start button does.
        let workout = await currentWorkout();
        let resumed = true;

        if (!workout) {
          resumed = false;
          const { data, error } = await supabase
            .from("workout_sessions")
            .insert({ user_id: user.id })
            .select("id")
            .single();
          if (error) return { ok: false, error: error.message };
          workout = data;
        }

        const slugs = Array.isArray(args.exercise_slugs) ? (args.exercise_slugs as string[]) : [];
        const added: string[] = [];

        for (const [index, slug] of slugs.entries()) {
          const exercise = await getExerciseBySlug(slug);
          if (!exercise) continue;
          const { error } = await supabase.from("workout_session_exercises").insert({
            workout_session_id: workout.id,
            exercise_id: exercise.id,
            order_index: index,
          });
          if (!error) added.push(exercise.name);
        }

        return {
          ok: true,
          data: {
            workout_id: workout.id,
            resumed_existing: resumed,
            exercises_added: added,
            url: `/workout/${workout.id}`,
          },
        };
      }

      case "add_exercise_to_workout": {
        const workout = await currentWorkout();
        if (!workout) return { ok: false, error: "No workout in progress. Start one first." };

        const exercise = await getExerciseBySlug(String(args.slug ?? ""));
        if (!exercise) return { ok: false, error: `No exercise with slug "${args.slug}".` };

        const { data: last } = await supabase
          .from("workout_session_exercises")
          .select("order_index")
          .eq("workout_session_id", workout.id)
          .order("order_index", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { error } = await supabase.from("workout_session_exercises").insert({
          workout_session_id: workout.id,
          exercise_id: exercise.id,
          order_index: (last?.order_index ?? -1) + 1,
        });

        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { added: exercise.name, url: `/workout/${workout.id}` } };
      }

      case "set_prescription": {
        const workout = await currentWorkout();
        if (!workout) return { ok: false, error: "No workout in progress. Start one first." };

        const exercise = await getExerciseBySlug(String(args.slug ?? ""));
        if (!exercise) return { ok: false, error: `No exercise with slug "${args.slug}".` };

        const { data: link } = await supabase
          .from("workout_session_exercises")
          .select("id")
          .eq("workout_session_id", workout.id)
          .eq("exercise_id", exercise.id)
          .maybeSingle();

        if (!link) {
          return { ok: false, error: `${exercise.name} is not in the current workout. Add it first.` };
        }

        const sets = Array.isArray(args.sets)
          ? (args.sets as { weight_kg?: number; reps?: number; hold_seconds?: number }[])
          : [];
        if (sets.length === 0) return { ok: false, error: "No sets given." };

        // Replace rather than append -- "plan 3x5" twice should leave 3 sets.
        // Only unfinished sets: a completed set is a record of what happened
        // and is not the coach's to overwrite.
        await supabase
          .from("workout_sets")
          .delete()
          .eq("workout_session_exercise_id", link.id)
          .eq("completed", false);

        const { data: remaining } = await supabase
          .from("workout_sets")
          .select("set_index")
          .eq("workout_session_exercise_id", link.id)
          .order("set_index", { ascending: false })
          .limit(1)
          .maybeSingle();

        let index = (remaining?.set_index ?? -1) + 1;

        const { error } = await supabase.from("workout_sets").insert(
          sets.map((set) => {
            const timed = typeof set.hold_seconds === "number";
            const hasWeight = set.weight_kg != null;
            // A held set counts seconds; a rep set counts reps. Weight can ride
            // along with either (a weighted plank, a loaded carry).
            const types: Enums<"workout_set_type">[] = timed
              ? hasWeight
                ? ["TIME", "WEIGHT"]
                : ["TIME"]
              : ["WEIGHT", "REPS"];
            return {
              workout_session_exercise_id: link.id,
              set_index: index++,
              types,
              reps: timed ? null : (set.reps ?? null),
              weight: set.weight_kg ?? null,
              // The constraint rejects a weight with no unit; the coach works in kg.
              weight_unit: hasWeight ? ("kg" as const) : null,
              duration_seconds: timed ? (set.hold_seconds ?? null) : null,
              completed: false,
            };
          }),
        );

        if (error) return { ok: false, error: error.message };

        return {
          ok: true,
          data: { exercise: exercise.name, sets_planned: sets.length, url: `/workout/${workout.id}` },
        };
      }

      case "follow_program": {
        const slug = String(args.slug ?? "");
        const program = await getProgramBySlug(slug);
        if (!program) return { ok: false, error: `No program with slug "${slug}".` };

        if (program.enrollment) {
          return { ok: true, data: { program: program.title, already_following: true } };
        }

        const { error } = await supabase
          .from("user_program_enrollments")
          .insert({ user_id: user.id, program_id: program.id });

        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { program: program.title, url: `/programs/${program.slug}` } };
      }

      case "save_coach_note": {
        const note = String(args.note ?? "").trim();
        if (!note) return { ok: false, error: "The note was empty." };

        const { error } = await supabase.from("ai_coach_notes").insert({ user_id: user.id, note });
        if (error) return { ok: false, error: error.message };

        return { ok: true, data: { saved: note } };
      }

      default:
        return { ok: false, error: `Unknown write tool "${name}".` };
    }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Tool failed." };
  }
}
