"use server";

import { listExercises } from "@/entities/exercise/api/exercise-queries";

export type PickerExercise = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  muscles: string[];
};

/**
 * Typeahead for the exercise picker.
 *
 * A server action rather than shipping the catalogue to the client: 876 rows
 * with images is not a payload, and the search belongs next to the index that
 * serves it.
 */
export async function searchExercisesForPicker(term: string): Promise<PickerExercise[]> {
  const { exercises } = await listExercises({ search: term.trim() || undefined, perPage: 12 });

  return exercises.map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    slug: exercise.slug,
    imageUrl: exercise.image_urls[0] ?? null,
    muscles: exercise.primary_muscles,
  }));
}
