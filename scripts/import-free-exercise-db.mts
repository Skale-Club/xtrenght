/**
 * Imports the free-exercise-db catalogue into public.exercises.
 *
 *   node --env-file=.env.local scripts/import-free-exercise-db.mts
 *
 * Source: github.com/yuhonas/free-exercise-db — 873 exercises, Unlicense
 * (public domain, no attribution required), each with demonstration images.
 *
 * Chosen over wger, whose data is share-alike licensed and would impose terms
 * on anything built with it.
 *
 * Upserts on slug, not legacy_id: this dataset's ids are strings ("3_4_Sit-Up")
 * while legacy_id is the integer key from the workout-cool CSV. Slug is already
 * unique, so re-running updates in place and the two sources dedupe against
 * each other.
 *
 * Uses the secret key, which bypasses RLS — the admin-only insert policy would
 * reject this otherwise.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database, Enums } from "../src/shared/types/database.types.ts";

const SOURCE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

type SourceExercise = {
  id: string;
  name: string;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
};

type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];

// Every distinct value in the source is mapped explicitly. Anything unmapped
// throws rather than silently dropping — a missing muscle would quietly make an
// exercise unfindable, which is worse than a failed import.
const CATEGORY: Record<string, Enums<"exercise_type">> = {
  strength: "STRENGTH",
  stretching: "STRETCHING",
  plyometrics: "PLYOMETRICS",
  powerlifting: "POWERLIFTING",
  "olympic weightlifting": "WEIGHTLIFTING",
  strongman: "STRONGMAN",
  cardio: "CARDIO",
};

const MUSCLE: Record<string, Enums<"muscle_group">> = {
  abdominals: "ABDOMINALS",
  abductors: "ABDUCTORS",
  adductors: "ADDUCTORS",
  biceps: "BICEPS",
  calves: "CALVES",
  chest: "CHEST",
  forearms: "FOREARMS",
  glutes: "GLUTES",
  hamstrings: "HAMSTRINGS",
  lats: "LATS",
  "lower back": "LOWER_BACK",
  "middle back": "MIDDLE_BACK",
  neck: "NECK",
  quadriceps: "QUADRICEPS",
  shoulders: "SHOULDERS",
  traps: "TRAPS",
  triceps: "TRICEPS",
};

const EQUIPMENT: Record<string, Enums<"equipment">> = {
  barbell: "BARBELL",
  dumbbell: "DUMBBELL",
  kettlebells: "KETTLEBELLS",
  cable: "CABLE",
  machine: "MACHINE",
  bands: "BANDS",
  "body only": "BODY_ONLY",
  "medicine ball": "MEDICINE_BALL",
  "exercise ball": "SWISS_BALL",
  "foam roll": "FOAM_ROLL",
  "e-z curl bar": "EZ_BAR",
  other: "OTHER",
};

const MECHANIC: Record<string, Enums<"mechanics_type">> = {
  compound: "COMPOUND",
  isolation: "ISOLATION",
};

const FORCE: Record<string, Enums<"exercise_force">> = {
  push: "PUSH",
  pull: "PULL",
  static: "STATIC",
};

const LEVEL: Record<string, Enums<"exercise_level">> = {
  beginner: "BEGINNER",
  intermediate: "INTERMEDIATE",
  expert: "EXPERT",
};

function mapOrThrow<T>(table: Record<string, T>, value: string, field: string, exercise: string): T {
  const mapped = table[value];
  if (!mapped) {
    throw new Error(`Unmapped ${field} "${value}" on "${exercise}". Add it to the map or extend the enum.`);
  }
  return mapped;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (try --env-file=.env.local).");
  process.exit(1);
}

console.log(`Fetching ${SOURCE_URL}`);
const response = await fetch(SOURCE_URL);
if (!response.ok) {
  console.error(`Download failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const source = (await response.json()) as SourceExercise[];
console.log(`${source.length} exercises in the source\n`);

const bySlug = new Map<string, ExerciseInsert>();
let skipped = 0;

for (const item of source) {
  const slug = slugify(item.name);
  if (!slug) {
    console.warn(`Skipping "${item.name}": name produces an empty slug.`);
    skipped++;
    continue;
  }

  // Instructions arrive as an array of steps. Wrapping each in <p> matches the
  // HTML the workout-cool rows already carry, so the detail page renders both
  // sources the same way.
  const description = item.instructions?.length
    ? item.instructions.map((step) => `<p>${step.trim()}</p>`).join("")
    : null;

  bySlug.set(slug, {
    name: item.name,
    slug,
    description,
    exercise_types: [mapOrThrow(CATEGORY, item.category, "category", item.name)],
    primary_muscles: item.primaryMuscles.map((m) => mapOrThrow(MUSCLE, m, "muscle", item.name)),
    secondary_muscles: item.secondaryMuscles.map((m) => mapOrThrow(MUSCLE, m, "muscle", item.name)),
    // null equipment means unknown in the source, not "no equipment needed" —
    // that is what "body only" is for. An empty array keeps the two apart.
    equipment: item.equipment ? [mapOrThrow(EQUIPMENT, item.equipment, "equipment", item.name)] : [],
    mechanics: item.mechanic ? mapOrThrow(MECHANIC, item.mechanic, "mechanic", item.name) : null,
    force: item.force ? mapOrThrow(FORCE, item.force, "force", item.name) : null,
    level: item.level ? mapOrThrow(LEVEL, item.level, "level", item.name) : null,
    image_urls: (item.images ?? []).map((path) => `${IMAGE_BASE}/${path}`),
    is_published: true,
  });
}

const exercises = [...bySlug.values()];
console.log(`${exercises.length} to import${skipped ? `, ${skipped} skipped` : ""}\n`);

const supabase = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BATCH_SIZE = 100;
let imported = 0;

for (let i = 0; i < exercises.length; i += BATCH_SIZE) {
  const batch = exercises.slice(i, i + BATCH_SIZE);
  const { error } = await supabase.from("exercises").upsert(batch, { onConflict: "slug" });

  if (error) {
    console.error(`Batch starting at ${i} failed: ${error.message}`);
    process.exit(1);
  }

  imported += batch.length;
  console.log(`  ${imported}/${exercises.length}`);
}

console.log(`\nDone. ${exercises.length} exercises upserted.`);
