"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/shared/lib/supabase/server";

/**
 * Deletes one coach note.
 *
 * No ownership filter is needed: the delete policy makes another user's note
 * unmatchable, so a wrong id deletes nothing rather than someone else's memory.
 */
export async function deleteCoachNote(id: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("ai_coach_notes").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/coach/memory");
  return { error: null };
}
