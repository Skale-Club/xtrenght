/**
 * Schema and RLS tests.
 *
 *   pnpm test:db
 *
 * Applies every migration to a throwaway Postgres (PGlite, in-memory WASM) and
 * asserts the schema behaves. No Docker, no cloud project, ~2 seconds.
 *
 * Most of this file tests RLS, because RLS is the authorization layer of this
 * app and it fails silently: a broken policy does not throw, it just returns
 * rows it shouldn't. The isolation checks below are the regression net for that
 * -- run them after any schema change.
 *
 * What is stubbed: the `auth` schema, the anon/authenticated/service_role roles,
 * and the default privileges that a real Supabase project bootstraps. auth.uid()
 * reads a GUC here instead of a JWT; everything downstream of it is the real
 * thing.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const db = new PGlite();
let failures = 0;

const ok = (name) => console.log(`  PASS  ${name}`);
const fail = (name, detail) => {
  failures++;
  console.log(`  FAIL  ${name}`);
  if (detail) console.log(`        ${detail}`);
};
const expect = (name, actual, expected) =>
  actual === expected ? ok(name) : fail(name, `expected ${expected}, got ${actual}`);

async function expectError(name, fn, fragment) {
  try {
    await fn();
    fail(name, "expected an error, statement succeeded");
  } catch (error) {
    if (fragment && !error.message.toLowerCase().includes(fragment.toLowerCase())) {
      fail(name, `wrong error: ${error.message}`);
    } else {
      ok(name);
    }
  }
}

const asUser = (userId) =>
  db.exec(`set role none; set request.jwt.claim.sub = '${userId}'; set role authenticated;`);
const asAnon = () => db.exec(`set role none; set request.jwt.claim.sub = ''; set role anon;`);
const asSuperuser = () => db.exec(`set role none; set request.jwt.claim.sub = '';`);

// --------------------------------------------------------------- bootstrap --

await db.exec(`
  create schema auth;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    raw_user_meta_data jsonb default '{}'::jsonb
  );

  create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

// -------------------------------------------------------------- migrations --

console.log("migrations:");
for (const file of readdirSync(join(SUPABASE_DIR, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    await db.exec(readFileSync(join(SUPABASE_DIR, "migrations", file), "utf8"));
    ok(file);
  } catch (error) {
    fail(file, error.message);
    console.log("\nMigration failed; aborting.");
    process.exit(1);
  }
}

// --------------------------------------------------------------- structure --

console.log("\nstructure:");
const { rows: classes } = await db.query(
  `select relname, relrowsecurity from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'`,
);

for (const table of [
  "profiles",
  "exercises",
  "user_favorite_exercises",
  "workout_sessions",
  "workout_session_exercises",
  "workout_sets",
]) {
  const row = classes.find((r) => r.relname === table);
  if (!row) fail(`${table} exists`, "missing");
  else if (!row.relrowsecurity) fail(`RLS enabled on ${table}`, "RLS is OFF -- table is wide open");
  else ok(`${table} exists with RLS enabled`);
}

// A table added without policies is invisible rather than public, but it is
// still a mistake worth catching early.
const { rows: unpolicied } = await db.query(`
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and not exists (select 1 from pg_policies p where p.tablename = c.relname)
`);
expect("every table has at least one policy", unpolicied.length, 0);

// ---------------------------------------------------------- signup trigger --

console.log("\nsignup trigger:");
const { rows: users } = await db.query(`
  insert into auth.users (email, raw_user_meta_data) values
    ('alice@test.com', '{"display_name":"Alice"}'::jsonb),
    ('bob@test.com', '{}'::jsonb)
  returning id, email
`);
const alice = users.find((u) => u.email === "alice@test.com").id;
const bob = users.find((u) => u.email === "bob@test.com").id;

const { rows: profiles } = await db.query(`select id, display_name from public.profiles`);
expect("a profile is created per auth user", profiles.length, 2);
expect("display_name comes from user metadata", profiles.find((p) => p.id === alice)?.display_name, "Alice");
expect("display_name falls back to the email local-part", profiles.find((p) => p.id === bob)?.display_name, "bob");

// ------------------------------------------------------------------- seed --

console.log("\nseed:");
await db.exec(readFileSync(join(SUPABASE_DIR, "seed.sql"), "utf8"));
await db.exec(readFileSync(join(SUPABASE_DIR, "seed.sql"), "utf8"));
const { rows: seeded } = await db.query(`select id, slug from public.exercises order by legacy_id`);
expect("seed.sql is idempotent", seeded.length, 3);

const lungeId = seeded.find((e) => e.slug === "barbell-alternating-reverse-lunges").id;

await db.query(`
  insert into public.exercises (legacy_id, name, slug, primary_muscles, is_published)
  values (999, 'Draft Exercise', 'draft-exercise', '{CHEST}', false)
`);

// -------------------------------------------------------------- typed enums --

console.log("\ntyped enums:");
await expectError(
  "an unknown muscle is rejected",
  () => db.query(`insert into public.exercises (name, slug, primary_muscles) values ('X','x','{NOT_A_MUSCLE}')`),
  "invalid input value for enum",
);
await expectError(
  "a muscle cannot be stored as equipment",
  () => db.query(`insert into public.exercises (name, slug, equipment) values ('Y','y','{BICEPS}')`),
  "invalid input value for enum",
);

// ------------------------------------------------------------- constraints --

console.log("\nconstraints:");
await expectError(
  "a weight without a unit is rejected",
  async () => {
    await db.exec(`
      insert into public.workout_sessions (id, user_id)
        values ('00000000-0000-0000-0000-0000000000aa', '${alice}');
      insert into public.workout_session_exercises (id, workout_session_id, exercise_id, order_index)
        values ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000aa', '${lungeId}', 0);
      insert into public.workout_sets (workout_session_exercise_id, set_index, weight)
        values ('00000000-0000-0000-0000-0000000000bb', 0, 100);
    `);
  },
  "workout_sets_weight_needs_unit",
);
await expectError(
  "a session ending before it starts is rejected",
  () =>
    db.query(
      `insert into public.workout_sessions (user_id, started_at, ended_at)
       values ('${alice}', now(), now() - interval '1 hour')`,
    ),
  "workout_sessions_ends_after_start",
);
await expectError(
  "a rating outside 1-5 is rejected",
  () => db.query(`insert into public.workout_sessions (user_id, rating) values ('${alice}', 9)`),
  "rating_check",
);
// Self-contained: the check above runs its inserts in one implicit transaction,
// so its session rolled back with it and cannot be reused here.
const { rows: fixtureSession } = await db.query(
  `insert into public.workout_sessions (user_id) values ('${alice}') returning id`,
);
await db.query(
  `insert into public.workout_session_exercises (workout_session_id, exercise_id, order_index)
   values ('${fixtureSession[0].id}', '${lungeId}', 0)`,
);
await expectError(
  "two exercises cannot share an order_index",
  () =>
    db.query(
      `insert into public.workout_session_exercises (workout_session_id, exercise_id, order_index)
       values ('${fixtureSession[0].id}', '${lungeId}', 0)`,
    ),
  "duplicate key",
);

// Removed so the RLS counts below start from a known-empty state.
await db.query(`delete from public.workout_sessions where id = '${fixtureSession[0].id}'`);

// ---------------------------------------------------------- RLS: the owner --

console.log("\nRLS -- owner can use their own data:");
await asUser(alice);

const { rows: session } = await db.query(
  `insert into public.workout_sessions (user_id) values ('${alice}') returning id`,
);
ok("owner creates a session");

const { rows: sessionExercise } = await db.query(
  `insert into public.workout_session_exercises (workout_session_id, exercise_id, order_index)
   values ('${session[0].id}', '${lungeId}', 0) returning id`,
);
ok("owner adds an exercise to it");

await db.query(`
  insert into public.workout_sets (workout_session_exercise_id, set_index, types, reps, weight, weight_unit, completed)
  values ('${sessionExercise[0].id}', 0, '{WEIGHT,REPS}', 8, 60.5, 'kg', true)
`);
ok("owner logs a set");

const { rows: own } = await db.query(`select id from public.workout_sessions`);
expect("owner reads their session back", own.length, 1);

await expectError(
  "user cannot create a session owned by someone else",
  () => db.query(`insert into public.workout_sessions (user_id) values ('${bob}')`),
  "row-level security",
);

// ------------------------------------------------------ RLS: another user --

console.log("\nRLS -- another user is locked out:");
await asUser(bob);

expect("cannot read the session", (await db.query(`select id from public.workout_sessions`)).rows.length, 0);
expect(
  "cannot read the nested session exercises",
  (await db.query(`select id from public.workout_session_exercises`)).rows.length,
  0,
);
expect("cannot read the nested sets", (await db.query(`select id from public.workout_sets`)).rows.length, 0);
expect(
  "cannot update the session",
  (await db.query(`update public.workout_sessions set rating = 1 where id = '${session[0].id}'`)).affectedRows,
  0,
);
expect(
  "cannot delete the session",
  (await db.query(`delete from public.workout_sessions where id = '${session[0].id}'`)).affectedRows,
  0,
);
await expectError(
  "cannot inject a set into the session",
  () =>
    db.query(
      `insert into public.workout_sets (workout_session_exercise_id, set_index, types)
       values ('${sessionExercise[0].id}', 5, '{REPS}')`,
    ),
  "row-level security",
);
const { rows: bobProfiles } = await db.query(`select id from public.profiles`);
expect("sees only their own profile", bobProfiles.length === 1 && bobProfiles[0].id === bob, true);

// -------------------------------------------------------- RLS: signed out --

console.log("\nRLS -- signed-out visitor:");
await asAnon();
const { rows: anonExercises } = await db.query(`select slug from public.exercises`);
expect("sees published exercises", anonExercises.length, 3);
expect("does not see unpublished ones", anonExercises.some((e) => e.slug === "draft-exercise"), false);
expect("sees no workout data", (await db.query(`select id from public.workout_sessions`)).rows.length, 0);
expect("sees no profiles", (await db.query(`select id from public.profiles`)).rows.length, 0);
await expectError(
  "cannot write to the catalogue",
  () => db.query(`insert into public.exercises (name, slug) values ('Hack','hack')`),
  "row-level security",
);

// -------------------------------------------------------------- RLS: admin --

console.log("\nRLS -- admin:");
await asSuperuser();
await db.query(`update public.profiles set role = 'admin' where id = '${bob}'`);
await asUser(bob);

expect("sees unpublished exercises", (await db.query(`select id from public.exercises`)).rows.length, 4);
await db.query(`insert into public.exercises (name, slug) values ('Admin Made','admin-made')`);
ok("can write to the catalogue");
expect(
  "still cannot see another user's workouts",
  (await db.query(`select id from public.workout_sessions`)).rows.length,
  0,
);

// ------------------------------------------------------ app query patterns --

console.log("\nqueries the app runs:");
await asUser(alice);

expect(
  "muscle chip filter (array overlap)",
  (await db.query(`select id from public.exercises where primary_muscles && '{QUADRICEPS}'::muscle_group[]`)).rows
    .length,
  1,
);
expect(
  "personal record (max weight)",
  Number((await db.query(`select max(weight) as b from public.workout_sets where completed and weight is not null`)).rows[0].b),
  60.5,
);
expect(
  "training volume (sum weight x reps)",
  Number((await db.query(`select coalesce(sum(weight * reps), 0) as v from public.workout_sets where completed`)).rows[0].v),
  484,
);

await asSuperuser();
expect(
  "GIN indexes back the array filters",
  (await db.query(`select indexname from pg_indexes where schemaname='public' and indexdef ilike '%gin%'`)).rows.length,
  4,
);

// ----------------------------------------------------------------- report --

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
