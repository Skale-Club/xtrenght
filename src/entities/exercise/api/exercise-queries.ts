import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Enums, Tables } from "@/shared/types/database.types";

export type Exercise = Tables<"exercises">;

export type ExerciseFilters = {
  search?: string;
  muscles?: Enums<"muscle_group">[];
  /** Browse filter: "show me barbell work". Overlap -- any listed equipment. */
  equipment?: Enums<"equipment">[];
  /**
   * Capability filter: "what can I do with what I own".
   *
   * Not the same question as `equipment` above, and the operator is the
   * opposite. Overlap would return the barbell bench press to someone who owns
   * only a bench; containment asks that *every* thing an exercise needs is
   * something they have. The 77 exercises requiring nothing pass trivially.
   *
   * `[]` and undefined differ: `[]` means "they own nothing" and filters hard,
   * undefined means "we never asked" and does not filter at all.
   */
  doableWith?: Enums<"equipment">[];
  page?: number;
  perPage?: number;
};

export type ExercisePage = {
  exercises: Exercise[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
};

/**
 * Catalogue listing, paginated.
 *
 * No is_published filter here -- the RLS policy already hides unpublished rows
 * from non-admins, and duplicating it in the query would also hide them from
 * admins, who are supposed to see them.
 */
export async function listExercises({
  search,
  muscles,
  equipment,
  doableWith,
  page = 1,
  perPage = 24,
}: ExerciseFilters = {}): Promise<ExercisePage> {
  const supabase = await createClient();

  // count: "exact" makes PostgREST return the total for the filter in the
  // Content-Range header, which is what tells us whether a next page exists.
  // "planned" would be cheaper but returns an estimate, and an estimate would
  // render a Next button that leads nowhere.
  let query = supabase.from("exercises").select("*", { count: "exact" });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }
  if (muscles?.length) {
    // overlaps == the && operator: matches rows sharing any listed muscle.
    query = query.overlaps("primary_muscles", muscles);
  }
  if (equipment?.length) {
    query = query.overlaps("equipment", equipment);
  }
  if (doableWith) {
    // containedBy == <@. The GIN index on exercises.equipment backs it: the
    // planner picks a Bitmap Index Scan, not a seq scan (verified on the live
    // catalogue, 0.8ms for 876 rows).
    query = query.containedBy("equipment", doableWith);
  }

  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * perPage;

  // range() is inclusive at both ends.
  const { data, count, error } = await query.order("name").range(from, from + perPage - 1);

  if (error) {
    throw new Error(`Failed to list exercises: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    exercises: data,
    total,
    page: safePage,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getExerciseBySlug(slug: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.from("exercises").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(`Failed to load exercise: ${error.message}`);
  }

  return data;
}

/**
 * Whether the signed-in user has favourited this exercise.
 *
 * Returns false when signed out rather than throwing: the catalogue is public,
 * and RLS returns no rows for anon anyway.
 */
export async function isFavorited(exerciseId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_favorite_exercises")
    .select("exercise_id")
    .eq("exercise_id", exerciseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check favourite: ${error.message}`);
  }

  return data !== null;
}

/** The signed-in user's saved exercises. RLS scopes this to them. */
export async function listFavoriteExercises() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_favorite_exercises")
    .select("created_at, exercises (id, name, slug, primary_muscles, image_urls)")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list favourites: ${error.message}`);
  }

  return data.flatMap((row) => (row.exercises ? [row.exercises] : []));
}
