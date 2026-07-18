import type { Tool } from "@/features/mcp/api/tools/types";
import { fail } from "@/features/mcp/api/tools/types";

/**
 * Following programs and starting their sessions -- the member's side of the
 * program feature, as opposed to authoring.
 *
 * Starting a program session copies the template's prescription into a fresh
 * workout as uncompleted sets and links the two. The link is written at start,
 * not completion: that is what lets a workout know which program it belongs to,
 * and why finishing the workout is what finishes the program session.
 */

const enrollInProgram: Tool = {
  name: "enroll_in_program",
  title: "Follow a program",
  description:
    "Enroll the caller in a program so they can start its sessions. Idempotent: " +
    "following a program twice returns the existing enrollment.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programId"],
    properties: { programId: { type: "string", description: "The program uuid to follow." } },
  },
  annotations: { idempotentHint: true },
  handler: async (input, { supabase, user }) => {
    const { programId } = input as { programId: string };

    const { data: existing } = await supabase
      .from("user_program_enrollments")
      .select("id")
      .eq("program_id", programId)
      .maybeSingle();

    if (existing) return { enrollmentId: existing.id, alreadyEnrolled: true };

    const { data, error } = await supabase
      .from("user_program_enrollments")
      .insert({ user_id: user.id, program_id: programId })
      .select("id")
      .single();

    if (error) fail(error.message);
    return { enrollmentId: data!.id, alreadyEnrolled: false };
  },
};

const leaveProgram: Tool = {
  name: "leave_program",
  title: "Leave a program",
  description:
    "Drop the caller's enrollment in a program. Progress rows cascade, but the " +
    "workouts already logged stay in history -- leaving a program does not erase " +
    "sessions you actually did.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programId"],
    properties: { programId: { type: "string", description: "The program uuid to leave." } },
  },
  annotations: { destructiveHint: true },
  handler: async (input, { supabase }) => {
    const { error } = await supabase
      .from("user_program_enrollments")
      .delete()
      .eq("program_id", (input as { programId: string }).programId);
    if (error) fail(error.message);
    return { left: true };
  },
};

const startProgramSession: Tool = {
  name: "start_program_session",
  title: "Start a program session",
  description:
    "Start a session from a followed program. Creates a workout, copies the " +
    "session's prescribed exercises and suggested sets into it, and links them. " +
    "If the session was already started, returns the existing workout. Requires " +
    "following the program first.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["programSessionId"],
    properties: { programSessionId: { type: "string", description: "The program-session uuid to start." } },
  },
  handler: async (input, { supabase, user }) => {
    const { programSessionId } = input as { programSessionId: string };

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

    if (sessionError) fail(sessionError.message);
    if (!programSession) fail("Program session not found (drafts are admin-only).");

    const { data: enrollment } = await supabase
      .from("user_program_enrollments")
      .select("id")
      .eq("program_id", programSession.program_weeks.program_id)
      .maybeSingle();

    if (!enrollment) fail("Follow the program before starting a session (use enroll_in_program).");

    const { data: existing } = await supabase
      .from("user_session_progress")
      .select("workout_session_id")
      .eq("enrollment_id", enrollment.id)
      .eq("program_session_id", programSessionId)
      .maybeSingle();

    if (existing) return { workoutSessionId: existing.workout_session_id, resumed: true };

    const { data: workout, error: workoutError } = await supabase
      .from("workout_sessions")
      .insert({ user_id: user.id })
      .select("id")
      .single();

    if (workoutError) fail(workoutError.message);

    // Copy the template in as a starting point. It is never read back from the
    // program, so editing the program later cannot rewrite a logged workout.
    for (const exercise of [...programSession.program_session_exercises].sort((a, b) => a.order_index - b.order_index)) {
      const { data: sessionExercise, error: exerciseError } = await supabase
        .from("workout_session_exercises")
        .insert({
          workout_session_id: workout!.id,
          exercise_id: exercise.exercise_id,
          order_index: exercise.order_index,
        })
        .select("id")
        .single();

      if (exerciseError) fail(exerciseError.message);

      const suggested = [...exercise.program_suggested_sets].sort((a, b) => a.set_index - b.set_index);
      if (suggested.length === 0) continue;

      const { error: setsError } = await supabase.from("workout_sets").insert(
        suggested.map((set) => ({
          workout_session_exercise_id: sessionExercise!.id,
          set_index: set.set_index,
          types: set.types,
          reps: set.reps,
          weight: set.weight,
          weight_unit: set.weight_unit,
          duration_seconds: set.duration_seconds,
          completed: false,
        })),
      );

      if (setsError) fail(setsError.message);
    }

    const { error: linkError } = await supabase.from("user_session_progress").insert({
      enrollment_id: enrollment.id,
      program_session_id: programSessionId,
      workout_session_id: workout!.id,
    });

    if (linkError) fail(linkError.message);
    return { workoutSessionId: workout!.id, resumed: false };
  },
};

export const programTools: Tool[] = [enrollInProgram, leaveProgram, startProgramSession];
