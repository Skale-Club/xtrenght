import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Json, Tables } from "@/shared/types/database.types";

export type Conversation = Tables<"ai_conversations">;
export type CoachMessage = Tables<"ai_messages">;

/**
 * The signed-in user's conversations, newest activity first.
 *
 * RLS scopes these -- no user filter, same as everywhere else in this codebase.
 */
export async function listConversations(limit = 30) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list conversations: ${error.message}`);
  }

  return data;
}

/**
 * One conversation with its transcript.
 *
 * Returns null for a conversation that does not exist *and* for one belonging
 * to somebody else -- RLS makes those indistinguishable, which is the right
 * amount to reveal.
 */
export async function getConversation(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, created_at, ai_messages (id, role, content, created_at)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load conversation: ${error.message}`);
  }
  if (!data) return null;

  return {
    ...data,
    // PostgREST cannot order nested rows; a transcript out of order is nonsense.
    ai_messages: [...data.ai_messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
  };
}

export type ConversationDetail = NonNullable<Awaited<ReturnType<typeof getConversation>>>;

/** Notes the coach has saved about this user. Loaded into every system prompt. */
export async function listCoachNotes(limit = 40) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_coach_notes")
    .select("id, note, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load coach notes: ${error.message}`);
  }

  return data;
}

/** Content blocks as stored. Narrowed at the render site. */
export type StoredBlock = { type: string; [key: string]: Json | undefined };

export function textOf(content: Json): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => {
      return (
        typeof block === "object" &&
        block !== null &&
        !Array.isArray(block) &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      );
    })
    .map((block) => block.text)
    .join("");
}
