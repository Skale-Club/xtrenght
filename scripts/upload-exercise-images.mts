/**
 * Rehosts exercise images from raw.githubusercontent.com into Supabase Storage
 * and repoints exercises.image_urls at the copies.
 *
 *   node --env-file=.env.local scripts/upload-exercise-images.mts
 *
 * The import lands image_urls on GitHub raw URLs, which is fine to develop
 * against and wrong to ship: no uptime guarantee, rate limits, and the images
 * disappear if that repo moves. This owns the bytes.
 *
 * Safe to re-run. It only touches rows whose image_urls still point at GitHub,
 * skips objects already in the bucket, and rewrites each row only after its
 * uploads succeed — so an interrupted run resumes instead of corrupting.
 *
 * Uses the secret key: uploads bypass the admin-only storage policy, and the
 * exercises update bypasses RLS.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/shared/types/database.types.ts";

const BUCKET = "exercise-images";
const GITHUB_PREFIX = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

// GitHub rate-limits raw content, and Storage is happier without a thundering
// herd. Eight at a time finishes ~1700 images in a couple of minutes.
const CONCURRENCY = 8;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (try --env-file=.env.local).");
  process.exit(1);
}

const supabase = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** github .../exercises/Barbell_Curl/0.jpg -> Barbell_Curl/0.jpg */
function storagePath(githubUrl: string) {
  return decodeURIComponent(githubUrl.slice(GITHUB_PREFIX.length));
}

function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function mirror(githubUrl: string): Promise<string> {
  const path = storagePath(githubUrl);

  const response = await fetch(githubUrl);
  if (!response.ok) {
    throw new Error(`GET ${githubUrl} -> ${response.status}`);
  }
  const body = new Uint8Array(await response.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: response.headers.get("content-type") ?? "image/jpeg",
    // An hour. Stated rather than inherited from the client default, so it is a
    // decision. Not longer: paths are names, not content hashes, so replacing an
    // image reuses its URL and a long TTL would serve the old one.
    cacheControl: "3600",
    // Overwrite rather than fail: a half-written object from a killed run must
    // not pin the catalogue to a broken image forever.
    upsert: true,
  });

  if (error) {
    throw new Error(`upload ${path}: ${error.message}`);
  }
  return publicUrl(path);
}

/** Runs tasks with a fixed number of workers, preserving input order. */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await fn(items[index]);
      }
    }),
  );

  return results;
}

const { data: exercises, error } = await supabase
  .from("exercises")
  .select("id, name, image_urls")
  .not("image_urls", "eq", "{}");

if (error) {
  console.error(`Failed to read exercises: ${error.message}`);
  process.exit(1);
}

const pending = exercises.filter((e) => e.image_urls.some((u) => u.startsWith(GITHUB_PREFIX)));

console.log(`${exercises.length} exercises with images, ${pending.length} still pointing at GitHub`);
if (pending.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

const totalImages = pending.reduce((n, e) => n + e.image_urls.length, 0);
console.log(`${totalImages} images to mirror, ${CONCURRENCY} at a time\n`);

let done = 0;
let failed = 0;

await pooled(pending, CONCURRENCY, async (exercise) => {
  try {
    const rehosted = await Promise.all(
      exercise.image_urls.map((u) => (u.startsWith(GITHUB_PREFIX) ? mirror(u) : Promise.resolve(u))),
    );

    // Only now is the row safe to rewrite: every image is in the bucket.
    const { error: updateError } = await supabase
      .from("exercises")
      .update({ image_urls: rehosted })
      .eq("id", exercise.id);

    if (updateError) throw new Error(updateError.message);

    done++;
    if (done % 50 === 0 || done === pending.length) {
      console.log(`  ${done}/${pending.length} exercises`);
    }
  } catch (cause) {
    failed++;
    console.error(`  FAILED ${exercise.name}: ${cause instanceof Error ? cause.message : cause}`);
  }
});

console.log(`\nDone. ${done} rehosted, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
