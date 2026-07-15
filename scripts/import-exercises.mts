/**
 * Imports a workout-cool exercise CSV into public.exercises.
 *
 *   node --env-file=.env.local scripts/import-exercises.mts data/exercises.csv
 *
 * .mts, not .ts: it uses top-level await, and without an explicit ESM extension
 * Node falls back to syntax detection and warns on every run.
 *
 * The source CSV is in long form: one row per (exercise, attribute_name,
 * attribute_value), so an exercise with three equipment tags spans three rows.
 * This pivots that back into one row per exercise with a typed array per
 * attribute category.
 *
 * Uses the secret key, which bypasses RLS -- the admin-only insert policy would
 * otherwise reject this. That key must never reach the browser; this file runs
 * under node and is not part of the Next.js build.
 */
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

import type { Database, Enums } from "../src/shared/types/database.types.ts";

type CsvRow = {
  id: string;
  name: string;
  name_en: string;
  description: string;
  description_en: string;
  full_video_url: string;
  full_video_image_url: string;
  introduction: string;
  introduction_en: string;
  slug: string;
  slug_en: string;
  attribute_name: string;
  attribute_value: string;
};

type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const csvPath = process.argv[2];

if (!url || !secretKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (try --env-file=.env.local).");
  process.exit(1);
}
if (!csvPath) {
  console.error("Usage: node --env-file=.env.local scripts/import-exercises.mts <path-to-csv>");
  process.exit(1);
}

const rows = parse(readFileSync(csvPath, "utf8"), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
}) as CsvRow[];

// Accumulate as Sets: the long format repeats an exercise's scalar fields on
// every attribute row, and duplicate attribute values are possible.
type Accumulator = {
  base: Omit<ExerciseInsert, "exercise_types" | "primary_muscles" | "secondary_muscles" | "equipment">;
  exercise_types: Set<string>;
  primary_muscles: Set<string>;
  secondary_muscles: Set<string>;
  equipment: Set<string>;
  mechanics: string | null;
};

const byLegacyId = new Map<number, Accumulator>();

for (const row of rows) {
  const legacyId = Number(row.id);
  if (!Number.isInteger(legacyId)) continue;

  // English-only app: prefer the _en columns, fall back to the French originals
  // so a partially-translated dataset still imports rather than landing null.
  const name = row.name_en?.trim() || row.name?.trim();
  const slug = row.slug_en?.trim() || row.slug?.trim();

  if (!name || !slug) {
    console.warn(`Skipping id=${row.id}: missing name or slug.`);
    continue;
  }

  let entry = byLegacyId.get(legacyId);
  if (!entry) {
    entry = {
      base: {
        legacy_id: legacyId,
        name,
        slug,
        description: row.description_en?.trim() || row.description?.trim() || null,
        introduction: row.introduction_en?.trim() || row.introduction?.trim() || null,
        full_video_url: row.full_video_url?.trim() || null,
        full_video_image_url: row.full_video_image_url?.trim() || null,
      },
      exercise_types: new Set(),
      primary_muscles: new Set(),
      secondary_muscles: new Set(),
      equipment: new Set(),
      mechanics: null,
    };
    byLegacyId.set(legacyId, entry);
  }

  const value = row.attribute_value?.trim();
  if (!value) continue;

  switch (row.attribute_name?.trim()) {
    case "TYPE":
      entry.exercise_types.add(value);
      break;
    case "PRIMARY_MUSCLE":
      entry.primary_muscles.add(value);
      break;
    case "SECONDARY_MUSCLE":
      entry.secondary_muscles.add(value);
      break;
    case "EQUIPMENT":
      entry.equipment.add(value);
      break;
    case "MECHANICS_TYPE":
      entry.mechanics = value;
      break;
    default:
      console.warn(`Unknown attribute_name "${row.attribute_name}" on id=${row.id}.`);
  }
}

const exercises: ExerciseInsert[] = [...byLegacyId.values()].map((entry) => ({
  ...entry.base,
  exercise_types: [...entry.exercise_types] as Enums<"exercise_type">[],
  primary_muscles: [...entry.primary_muscles] as Enums<"muscle_group">[],
  secondary_muscles: [...entry.secondary_muscles] as Enums<"muscle_group">[],
  equipment: [...entry.equipment] as Enums<"equipment">[],
  mechanics: entry.mechanics as Enums<"mechanics_type"> | null,
}));

const supabase = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Conflict on legacy_id so re-running updates in place instead of duplicating.
// Postgres rejects unknown enum values, so a bad attribute fails the batch
// loudly rather than importing a half-tagged exercise.
const BATCH_SIZE = 100;
let imported = 0;

for (let i = 0; i < exercises.length; i += BATCH_SIZE) {
  const batch = exercises.slice(i, i + BATCH_SIZE);
  const { error } = await supabase.from("exercises").upsert(batch, { onConflict: "legacy_id" });

  if (error) {
    console.error(`Batch starting at ${i} failed: ${error.message}`);
    process.exit(1);
  }

  imported += batch.length;
  console.log(`Imported ${imported}/${exercises.length}`);
}

console.log(`Done. ${exercises.length} exercises from ${rows.length} CSV rows.`);
