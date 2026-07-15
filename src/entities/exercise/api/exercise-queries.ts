import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Enums, Tables } from "@/shared/types/database.types";

export type Exercise = Tables<"exercises">;

export type ExerciseFilters = {
  search?: string;
  muscles?: Enums<"muscle_group">[];
  equipment?: Enums<"equipment">[];
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
