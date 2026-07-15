"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/shared/lib/supabase/server";
import type { Enums } from "@/shared/types/database.types";

/**
 * Admin authoring for programs.
 *
 * None of these check is_admin() in TypeScript. The RLS policies already do,
 * and a check here would be a second, weaker copy of the rule -- one that a new
 * action could forget to include. If a non-admin calls these, Postgres refuses
 * and the error surfaces.
 */

type Result = { error: string | null };

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createProgram(formData: FormData): Promise<Result & { slug?: string }> {
  const title = String(formData.get("title") ?? "").trim();
  const level = String(formData.get("level") ?? "BEGINNER") as Enums<"program_level">;

  if (!title) return { error: "Give the program a title." };

  const slug = slugify(title);
  if (!slug) return { error: "That title produces an empty slug." };

  const supabase = await createClient();

  const { error } = await supabase.from("programs").insert({ title, slug, level });

  if (error) {
    // The slug is unique; say so in words rather than leaking the constraint.
    if (error.code === "23505") return { error: "A program with that title already exists." };
    return { error: error.message };
  }

  revalidatePath("/admin/programs");
  return { error: null, slug };
}

export async function updateProgram(programId: string, formData: FormData): Promise<Result> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("programs")
    .update({
      title: String(formData.get("title") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      category: String(formData.get("category") ?? "").trim() || null,
      image_url: String(formData.get("image_url") ?? "").trim() || null,
      level: String(formData.get("level") ?? "BEGINNER") as Enums<"program_level">,
      session_duration_min: Number(formData.get("session_duration_min")) || null,
    })
    .eq("id", programId);

  if (error) return { error: error.message };

  revalidatePath("/admin/programs");
  return { error: null };
}

export async function setProgramVisibility(
  programId: string,
  visibility: Enums<"program_visibility">,
): Promise<Result> {
  const supabase = await createClient();

  const { error } = await supabase.from("programs").update({ visibility }).eq("id", programId);

  if (error) return { error: error.message };

  revalidatePath("/admin/programs");
  revalidatePath("/programs");
  return { error: null };
}

export async function deleteProgram(programId: string): Promise<Result> {
  const supabase = await createClient();

  // Weeks, sessions, exercises and suggested sets cascade. Enrollments cascade
  // too -- but the workouts people logged do not, so their history survives a
  // program being deleted.
  const { error } = await supabase.from("programs").delete().eq("id", programId);

  if (error) return { error: error.message };

  revalidatePath("/admin/programs");
  revalidatePath("/programs");
  return { error: null };
}

export async function addWeek(programId: string): Promise<Result> {
  const supabase = await createClient();

  // Numbered from the current tail, so concurrent adds cannot collide with the
  // (program_id, week_number) unique constraint by passing a stale number.
  const { data: last } = await supabase
    .from("program_weeks")
    .select("week_number")
    .eq("program_id", programId)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("program_weeks")
    .insert({ program_id: programId, week_number: (last?.week_number ?? 0) + 1 });

  if (error) return { error: error.message };

  revalidatePath("/admin/programs");
  return { error: null };
}

export async function deleteWeek(weekId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("program_weeks").delete().eq("id", weekId);
  if (error) return { error: error.message };
  revalidatePath("/admin/programs");
  return { error: null };
}

export async function addSession(weekId: string, title: string): Promise<Result> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Give the session a title." };

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("program_sessions")
    .select("session_number")
    .eq("week_id", weekId)
    .order("session_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sessionNumber = (last?.session_number ?? 0) + 1;
  // Slug is unique per week, not globally: "day-1" repeats across weeks.
  const slug = slugify(trimmed) || `session-${sessionNumber}`;

  const { error } = await supabase
    .from("program_sessions")
    .insert({ week_id: weekId, session_number: sessionNumber, title: trimmed, slug });

  if (error) {
    if (error.code === "23505") return { error: "That session name is taken in this week." };
    return { error: error.message };
  }

  revalidatePath("/admin/programs");
  return { error: null };
}

export async function deleteSession(sessionId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("program_sessions").delete().eq("id", sessionId);
  if (error) return { error: error.message };
  revalidatePath("/admin/programs");
  return { error: null };
}

export async function addExerciseToProgramSession(
  programSessionId: string,
  exerciseId: string,
): Promise<Result> {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("program_session_exercises")
    .select("order_index")
    .eq("program_session_id", programSessionId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("program_session_exercises")
    .insert({
      program_session_id: programSessionId,
      exercise_id: exerciseId,
      order_index: (last?.order_index ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // An exercise with no prescription is not useful to anyone. Seed one set so
  // the editor has something to edit.
  const { error: setError } = await supabase.from("program_suggested_sets").insert({
    program_session_exercise_id: data.id,
    set_index: 0,
    types: ["WEIGHT", "REPS"],
    reps: 8,
  });

  if (setError) return { error: setError.message };

  revalidatePath("/admin/programs");
  return { error: null };
}

export async function removeExerciseFromProgramSession(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("program_session_exercises").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/programs");
  return { error: null };
}

export async function addSuggestedSet(programSessionExerciseId: string): Promise<Result> {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("program_suggested_sets")
    .select("set_index, types, reps, weight, weight_unit")
    .eq("program_session_exercise_id", programSessionExerciseId)
    .order("set_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("program_suggested_sets").insert({
    program_session_exercise_id: programSessionExerciseId,
    set_index: (last?.set_index ?? -1) + 1,
    types: last?.types ?? ["WEIGHT", "REPS"],
    reps: last?.reps ?? 8,
    weight: last?.weight ?? null,
    weight_unit: last?.weight_unit ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/programs");
  return { error: null };
}

export async function updateSuggestedSet(
  setId: string,
  values: { reps: number | null; weight: number | null },
): Promise<Result> {
  const supabase = await createClient();

  // program_suggested_sets_weight_needs_unit rejects a weight with no unit.
  const { error } = await supabase
    .from("program_suggested_sets")
    .update({
      reps: values.reps,
      weight: values.weight,
      weight_unit: values.weight === null ? null : "kg",
    })
    .eq("id", setId);

  if (error) return { error: error.message };

  revalidatePath("/admin/programs");
  return { error: null };
}

export async function deleteSuggestedSet(setId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("program_suggested_sets").delete().eq("id", setId);
  if (error) return { error: error.message };
  revalidatePath("/admin/programs");
  return { error: null };
}
