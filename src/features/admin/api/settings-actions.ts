"use server";

import { revalidatePath } from "next/cache";

import { invalidateSettingsCache } from "@/shared/lib/supabase/config-reader";
import { createClient } from "@/shared/lib/supabase/server";

/**
 * Admin settings.
 *
 * These call `admin_list_settings()` / `admin_set_setting()` with the *user's*
 * client, not an elevated one. The functions are SECURITY DEFINER and check
 * is_admin() themselves, so the admin check happens in Postgres -- a
 * non-admin calling these gets "not authorized" from the database, not from a
 * TypeScript guard that a future refactor could drop.
 *
 * A secret's value is never returned by admin_list_settings(); the panel shows
 * whether it is set, and changing one means overwriting it.
 */

export type SettingRow = {
  key: string;
  value: string | null;
  is_secret: boolean;
  is_set: boolean;
  description: string | null;
  updated_at: string;
};

export async function listSettings(): Promise<SettingRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_list_settings");

  if (error) {
    throw new Error(`Failed to load settings: ${error.message}`);
  }

  return data ?? [];
}

export async function saveSetting(
  key: string,
  value: string,
  isSecret: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("admin_set_setting", {
    setting_key: key,
    setting_value: value,
    setting_is_secret: isSecret,
  });

  if (error) {
    // 42501 is the "not authorized" the function raises. Say it in words.
    if (error.code === "42501") return { error: "You are not an admin." };
    return { error: error.message };
  }

  // The route caches settings for a minute; without this, saving a key and
  // immediately trying the coach would still hit the old value.
  invalidateSettingsCache();

  revalidatePath("/admin/settings");
  return { error: null };
}
