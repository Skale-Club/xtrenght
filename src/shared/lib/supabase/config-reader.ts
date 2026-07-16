import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/types/database.types";

/**
 * The one place in this codebase that reads with an elevated client at request
 * time. Read this before adding anything to it.
 *
 * ## Why it exists
 *
 * Runtime config (the OpenRouter key, the coach's model) lives in
 * `app_settings` so an admin can change it from /admin without a redeploy. That
 * table has RLS on and *no policies*, so nothing can read it over the API --
 * not a user, not an admin, not a model that has been talked into trying.
 *
 * Which leaves one problem: the server still has to read it. The chat route
 * runs with the signed-in user's JWT, and that user is not an admin. So the
 * read has to be privileged. There is no third option: if the value is hidden
 * from every client, whoever fetches it is not a client.
 *
 * ## The line this must not cross
 *
 * The elevated client bypasses RLS entirely. It is confined here, and it is
 * only ever used to read `app_settings`.
 *
 * - It is never returned to a caller.
 * - It is never handed to a model or a tool.
 * - It never touches user data -- no workouts, no sets, no conversations.
 *
 * The guarantee that matters is unchanged: the coach reaches the database only
 * through the user's own JWT, so it physically cannot read someone else's
 * training. That property lives or dies on this file staying this small.
 */

let cached: { values: Record<string, string>; expiresAt: number } | null = null;

// A minute. Long enough that a chatty conversation doesn't re-read the row on
// every turn; short enough that changing the model in /admin takes effect while
// you're still looking at the page.
const TTL_MS = 60_000;

function elevatedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error("Server is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  }

  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadSettings(): Promise<Record<string, string>> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.values;
  }

  const { data, error } = await elevatedClient().from("app_settings").select("key, value");

  if (error) {
    throw new Error(`Failed to read app settings: ${error.message}`);
  }

  const values = Object.fromEntries(data.map((row) => [row.key, row.value]));
  cached = { values, expiresAt: Date.now() + TTL_MS };
  return values;
}

/** Drops the cache so an admin's save is visible immediately. */
export function invalidateSettingsCache() {
  cached = null;
}

export type CoachConfig = {
  apiKey: string;
  model: string;
  effort: string;
  systemPromptOverride: string | null;
};

/**
 * Resolved coach configuration.
 *
 * Returns null when there is no API key, which is a normal state -- a fresh
 * install has an empty one until an admin fills it in. The route turns that
 * into "the coach is not configured yet", not a crash.
 */
export async function getCoachConfig(): Promise<CoachConfig | null> {
  const settings = await loadSettings();

  const apiKey = settings.openrouter_api_key?.trim();
  if (!apiKey) return null;

  const override = settings.coach_system_prompt?.trim();

  return {
    apiKey,
    model: settings.coach_model?.trim() || "anthropic/claude-opus-4.8",
    effort: settings.coach_effort?.trim() || "high",
    systemPromptOverride: override || null,
  };
}
