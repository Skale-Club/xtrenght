import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Enums, Tables } from "@/shared/types/database.types";

export type Exercise = Tables<"exercises">;

export type ExerciseFilters = {
  search?: string;
  muscles?: Enums<"muscle_group">[];
  equipment?: Enums<"equipment">[];
  limit?: number;
};

/**
 * Catalogue listing.
 *
 * No is_published filter here -- the RLS policy already hides unpublished rows
 * from non-admins, and duplicating it in the query would also hide them from
 * admins, who are supposed to see them.
 */
export async function listExercises({ search, muscles, equipment, limit = 50 }: ExerciseFilters = {}) {
  const supabase = await createClient();

  let query = supabase.from("exercises").select("*").order("name").limit(limit);

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

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list exercises: ${error.message}`);
  }

  return data;
}

export async function getExerciseBySlug(slug: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.from("exercises").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(`Failed to load exercise: ${error.message}`);
  }

  return data;
}
