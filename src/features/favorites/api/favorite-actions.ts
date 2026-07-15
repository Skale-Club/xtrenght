"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/shared/lib/supabase/server";

/**
 * Toggles an exercise favourite for the signed-in user.
 *
 * user_id is passed explicitly because the insert policy's WITH CHECK compares
 * it to auth.uid(); the delete needs no ownership filter, since RLS makes
 * another user's row unmatchable.
 */
export async function toggleFavorite(exerciseId: string, slug: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to save favourites." };
  }

  const { data: existing } = await supabase
    .from("user_favorite_exercises")
    .select("exercise_id")
    .eq("exercise_id", exerciseId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_favorite_exercises")
      .delete()
      .eq("exercise_id", exerciseId);

    if (error) return { error: error.message };
    revalidatePath(`/exercises/${slug}`);
    return { error: null, favorited: false };
  }

  const { error } = await supabase
    .from("user_favorite_exercises")
    .insert({ user_id: user.id, exercise_id: exerciseId });

  if (error) return { error: error.message };

  revalidatePath(`/exercises/${slug}`);
  return { error: null, favorited: true };
}
