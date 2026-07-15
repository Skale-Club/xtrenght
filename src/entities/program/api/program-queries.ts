import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Enums, Tables } from "@/shared/types/database.types";

export type Program = Tables<"programs">;

// Bodyweight sits outside the member's owned list — everyone has their own
// body — so a program tagged with these is doable no matter what they picked.
const ALWAYS_AVAILABLE: Enums<"equipment">[] = ["BODY_ONLY", "NONE", "NA"];

export type RecommendedProgram = Pick<
  Program,
  "id" | "slug" | "title" | "description" | "level" | "equipment" | "image_url" | "participant_count"
>;

/**
 * Published programs a member can actually run with the equipment they have.
 *
 * "Doable" means every piece of equipment the program calls for is either owned
 * or always-available (bodyweight); a program needing a barbell is not
 * recommended to someone training at home with bands. An empty equipment list
 * on a program is bodyweight and always qualifies.
 *
 * The subset filter runs here rather than in SQL: PostgREST's array operators
 * cover overlap and containment in the other direction (does the column contain
 * these values), not "is the column contained by this set". The candidate list
 * is small — published programs only — so filtering in code is cheap and clear.
 */
export async function listRecommendedPrograms(
  equipment: Enums<"equipment">[],
  limit = 4,
): Promise<RecommendedProgram[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("programs")
    .select("id, slug, title, description, level, equipment, image_url, participant_count")
    .eq("visibility", "PUBLISHED")
    .order("participant_count", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list recommended programs: ${error.message}`);
  }

  const available = new Set<string>([...equipment, ...ALWAYS_AVAILABLE]);

  return data.filter((program) => program.equipment.every((e) => available.has(e))).slice(0, limit);
}

/**
 * Programs for the public catalogue.
 *
 * No visibility filter: the RLS policy already hides drafts from non-admins,
 * and filtering here would hide them from admins too -- who need to see their
 * own unpublished work.
 */
export async function listPrograms() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("programs")
    .select("*, program_weeks (id, program_sessions (id))")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list programs: ${error.message}`);
  }

  // Week and session counts are computed from the tree rather than stored.
  // workout-cool keeps durationWeeks and sessionsPerWeek as columns, which lets
  // a "4 week program" ship with three weeks of content.
  return data.map((program) => ({
    ...program,
    weekCount: program.program_weeks.length,
    sessionCount: program.program_weeks.reduce((n, w) => n + w.program_sessions.length, 0),
  }));
}

export type ProgramSessionState = "done" | "in_progress" | "next" | "locked";

/**
 * The full program tree, plus this user's progress through it.
 *
 * The cursor -- which session comes next -- is derived here, not stored. A
 * session is done when its linked workout has ended; the next one is the first
 * that isn't. workout-cool stores currentWeek/currentSession on the enrollment
 * and moves them when a session *starts*, so abandoning one leaves the pointer
 * describing work that never happened.
 */
export async function getProgramBySlug(slug: string) {
  const supabase = await createClient();

  const { data: program, error } = await supabase
    .from("programs")
    .select(
      `
      *,
      program_weeks (
        id, week_number, title, description,
        program_sessions (
          id, session_number, slug, title, description, estimated_minutes,
          program_session_exercises (
            id, order_index, instructions,
            exercises ( id, name, slug, image_urls ),
            program_suggested_sets ( id, set_index, types, reps, weight, weight_unit, duration_seconds )
          )
        )
      )
    `,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load program: ${error.message}`);
  }
  if (!program) return null;

  // PostgREST cannot order nested rows; sort the tree here.
  const weeks = [...program.program_weeks]
    .sort((a, b) => a.week_number - b.week_number)
    .map((week) => ({
      ...week,
      program_sessions: [...week.program_sessions]
        .sort((a, b) => a.session_number - b.session_number)
        .map((session) => ({
          ...session,
          program_session_exercises: [...session.program_session_exercises]
            .sort((a, b) => a.order_index - b.order_index)
            .map((exercise) => ({
              ...exercise,
              program_suggested_sets: [...exercise.program_suggested_sets].sort(
                (a, b) => a.set_index - b.set_index,
              ),
            })),
        })),
    }));

  // RLS returns nothing here when signed out, so this is null for visitors.
  const { data: enrollment } = await supabase
    .from("user_program_enrollments")
    .select("id, enrolled_at, user_session_progress (program_session_id, workout_session_id, workout_sessions (ended_at))")
    .eq("program_id", program.id)
    .maybeSingle();

  const progressBySession = new Map(
    (enrollment?.user_session_progress ?? []).map((p) => [
      p.program_session_id,
      { workoutSessionId: p.workout_session_id, finished: p.workout_sessions?.ended_at !== null },
    ]),
  );

  const ordered = weeks.flatMap((w) => w.program_sessions.map((s) => s.id));
  const firstUnfinished = ordered.find((id) => !progressBySession.get(id)?.finished);

  function stateOf(sessionId: string): ProgramSessionState {
    const progress = progressBySession.get(sessionId);
    if (progress?.finished) return "done";
    if (progress) return "in_progress";
    // Not a paywall -- just the reading order. Any session can still be opened.
    return sessionId === firstUnfinished ? "next" : "locked";
  }

  const completedCount = ordered.filter((id) => progressBySession.get(id)?.finished).length;

  return {
    ...program,
    program_weeks: weeks,
    enrollment: enrollment ? { id: enrollment.id, enrolledAt: enrollment.enrolled_at } : null,
    progress: {
      completedCount,
      totalCount: ordered.length,
      stateOf,
      workoutIdFor: (sessionId: string) => progressBySession.get(sessionId)?.workoutSessionId ?? null,
      nextSessionId: firstUnfinished ?? null,
    },
  };
}

export type ProgramDetail = NonNullable<Awaited<ReturnType<typeof getProgramBySlug>>>;

/**
 * The program tree for the admin editor, addressed by id.
 *
 * By id and not slug: the slug is derived from the title, and an editor that
 * loses its URL the moment you fix a typo is a bad editor.
 *
 * No admin check here. RLS returns a draft only to an admin, so a non-admin
 * gets null and the page 404s -- the same answer as for a program that does not
 * exist, which is the right amount to reveal.
 */
export async function getProgramForEditing(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("programs")
    .select(
      `
      *,
      program_weeks (
        id, week_number, title, description,
        program_sessions (
          id, session_number, slug, title, description, estimated_minutes,
          program_session_exercises (
            id, order_index, instructions,
            exercises ( id, name, slug, image_urls ),
            program_suggested_sets ( id, set_index, types, reps, weight, weight_unit, duration_seconds )
          )
        )
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load program: ${error.message}`);
  }
  if (!data) return null;

  return {
    ...data,
    program_weeks: [...data.program_weeks]
      .sort((a, b) => a.week_number - b.week_number)
      .map((week) => ({
        ...week,
        program_sessions: [...week.program_sessions]
          .sort((a, b) => a.session_number - b.session_number)
          .map((session) => ({
            ...session,
            program_session_exercises: [...session.program_session_exercises]
              .sort((a, b) => a.order_index - b.order_index)
              .map((exercise) => ({
                ...exercise,
                program_suggested_sets: [...exercise.program_suggested_sets].sort(
                  (a, b) => a.set_index - b.set_index,
                ),
              })),
          })),
      })),
  };
}

export type ProgramForEditing = NonNullable<Awaited<ReturnType<typeof getProgramForEditing>>>;
