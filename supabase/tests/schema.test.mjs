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
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// pg_trgm has to be loaded into the instance before a migration can CREATE
// EXTENSION it. Supabase ships it already available, hence the difference.
const db = new PGlite({ extensions: { pg_trgm } });
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

/** Rows-only query helper; most assertions here only care about the rows. */
const q = async (sql) => (await db.query(sql)).rows;

const asUser = (userId) =>
  db.exec(`set role none; set request.jwt.claim.sub = '${userId}'; set role authenticated;`);
const asAnon = () => db.exec(`set role none; set request.jwt.claim.sub = ''; set role anon;`);
const asSuperuser = () => db.exec(`set role none; set request.jwt.claim.sub = '';`);

// --------------------------------------------------------------- bootstrap --

await db.exec(`
  -- Supabase installs extensions into a dedicated schema, and migration 8
  -- schema-qualifies gin_trgm_ops against it.
  create schema extensions;

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

  -- Supabase Storage, reduced to the two tables the migrations touch. Enough to
  -- prove the bucket row and its policies are valid SQL; the storage API itself
  -- is not modelled and is not what these tests are for.
  create schema storage;

  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text,
    owner uuid
  );

  alter table storage.objects enable row level security;

  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
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
  "programs",
  "program_weeks",
  "program_sessions",
  "program_session_exercises",
  "program_suggested_sets",
  "user_program_enrollments",
  "user_session_progress",
  "ai_conversations",
  "ai_messages",
  "ai_coach_notes",
]) {
  const row = classes.find((r) => r.relname === table);
  if (!row) fail(`${table} exists`, "missing");
  else if (!row.relrowsecurity) fail(`RLS enabled on ${table}`, "RLS is OFF -- table is wide open");
  else ok(`${table} exists with RLS enabled`);
}

// A table added without policies is invisible rather than public, but it is
// almost always a mistake -- so every table needs one, except where having
// none is the point.
//
// app_settings is that exception: RLS on with nothing granted is what makes the
// OpenRouter key unreadable over the API by anyone at all. Asserted separately
// below rather than waved through, so "no policies" stays a decision instead of
// drifting into an oversight.
const DELIBERATELY_UNPOLICIED = ["app_settings"];

const { rows: unpolicied } = await db.query(`
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and not exists (select 1 from pg_policies p where p.tablename = c.relname)
`);
const unexpected = unpolicied.map((r) => r.relname).filter((t) => !DELIBERATELY_UNPOLICIED.includes(t));
expect(`every table has a policy, except ${DELIBERATELY_UNPOLICIED.join(", ")}`, unexpected.length, 0);

for (const table of DELIBERATELY_UNPOLICIED) {
  const { rows } = await db.query(`
    select c.relrowsecurity, count(p.policyname)::int as policies
    from pg_class c
    left join pg_policies p on p.tablename = c.relname and p.schemaname = 'public'
    where c.relname = '${table}' and c.relnamespace = 'public'::regnamespace
    group by c.relrowsecurity
  `);
  expect(`${table} has RLS on and zero policies (unreadable by design)`,
    rows[0]?.relrowsecurity === true && rows[0]?.policies === 0, true);
}

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

// ------------------------------------------------------------- programs --

console.log("\nprograms -- template visibility:");
await asSuperuser();

const insertedPrograms = await q(`
  insert into public.programs (slug, title, level, visibility) values
    ('starting-strength', 'Starting Strength', 'BEGINNER', 'PUBLISHED'),
    ('secret-program', 'Secret Program', 'EXPERT', 'DRAFT')
  returning id, slug
`);
const published = insertedPrograms.find((p) => p.slug === "starting-strength");
const draft = insertedPrograms.find((p) => p.slug === "secret-program");

const weekId = (
  await q(
    `insert into public.program_weeks (program_id, week_number, title)
     values ('${published.id}', 1, 'Week 1') returning id`,
  )
)[0].id;

const draftWeekId = (
  await q(
    `insert into public.program_weeks (program_id, week_number, title)
     values ('${draft.id}', 1, 'Hidden week') returning id`,
  )
)[0].id;

const progSessionId = (
  await q(
    `insert into public.program_sessions (week_id, session_number, slug, title)
     values ('${weekId}', 1, 'day-1', 'Day 1') returning id`,
  )
)[0].id;

const progExerciseId = (
  await q(
    `insert into public.program_session_exercises (program_session_id, exercise_id, order_index, instructions)
     values ('${progSessionId}', '${lungeId}', 0, 'Warm up first.') returning id`,
  )
)[0].id;

await q(
  `insert into public.program_suggested_sets (program_session_exercise_id, set_index, types, reps, weight, weight_unit)
   values ('${progExerciseId}', 0, '{WEIGHT,REPS}', 8, 60, 'kg')`,
);

// A visitor must see the published tree and none of the draft.
await asAnon();
expect("signed-out visitor sees the published program", (await q(`select id from public.programs`)).length, 1);
expect(
  "signed-out visitor cannot see the draft program",
  (await q(`select id from public.programs where slug = 'secret-program'`)).length,
  0,
);
expect(
  "visibility is inherited by weeks",
  (await q(`select id from public.program_weeks`)).length,
  1,
);
expect(
  "a draft's week is hidden even when addressed directly",
  (await q(`select id from public.program_weeks where id = '${draftWeekId}'`)).length,
  0,
);
expect("visibility is inherited by sessions", (await q(`select id from public.program_sessions`)).length, 1);
expect(
  "visibility is inherited by suggested sets",
  (await q(`select id from public.program_suggested_sets`)).length,
  1,
);
await expectError(
  "a visitor cannot author a program",
  () => db.query(`insert into public.programs (slug, title, level) values ('hack', 'Hack', 'EXPERT')`),
  "row-level security",
);

console.log("\nprograms -- enrollment:");
await asUser(alice);

const enrollmentId = (
  await q(
    `insert into public.user_program_enrollments (user_id, program_id)
     values ('${alice}', '${published.id}') returning id`,
  )
)[0].id;
ok("owner can enroll in a published program");

await expectError(
  "nobody can enroll in a draft program",
  () =>
    db.query(
      `insert into public.user_program_enrollments (user_id, program_id)
       values ('${alice}', '${draft.id}')`,
    ),
  "row-level security",
);

await expectError(
  "a user cannot enroll somebody else",
  () =>
    db.query(
      `insert into public.user_program_enrollments (user_id, program_id)
       values ('${bob}', '${published.id}')`,
    ),
  "row-level security",
);

await asSuperuser();
expect(
  "the trigger counts the participant",
  (await q(`select participant_count from public.programs where id = '${published.id}'`))[0].participant_count,
  1,
);

// Starting a program session links it to a real workout, at start.
await asUser(alice);
const progWorkout = (
  await q(`insert into public.workout_sessions (user_id) values ('${alice}') returning id`)
)[0].id;

await q(
  `insert into public.user_session_progress (enrollment_id, program_session_id, workout_session_id)
   values ('${enrollmentId}', '${progSessionId}', '${progWorkout}')`,
);
ok("owner links a program session to their workout");

expect(
  "the session counts as done only once its workout ends",
  (
    await q(`
      select count(*)::int as n
      from public.user_session_progress p
      join public.workout_sessions s on s.id = p.workout_session_id
      where p.enrollment_id = '${enrollmentId}' and s.ended_at is not null
    `)
  )[0].n,
  0,
);

await q(`update public.workout_sessions set ended_at = now() where id = '${progWorkout}'`);
expect(
  "finishing the workout completes the program session, with no second write",
  (
    await q(`
      select count(*)::int as n
      from public.user_session_progress p
      join public.workout_sessions s on s.id = p.workout_session_id
      where p.enrollment_id = '${enrollmentId}' and s.ended_at is not null
    `)
  )[0].n,
  1,
);

console.log("\nprograms -- another user is locked out:");
await asUser(bob);
expect("cannot see the enrollment", (await q(`select id from public.user_program_enrollments`)).length, 0);
expect("cannot see the session progress", (await q(`select id from public.user_session_progress`)).length, 0);

const bobEnrollment = (
  await q(
    `insert into public.user_program_enrollments (user_id, program_id)
     values ('${bob}', '${published.id}') returning id`,
  )
)[0].id;

// Bob owns an enrollment, but not Alice's workout.
await expectError(
  "cannot attach another user's workout to their own progress",
  () =>
    db.query(
      `insert into public.user_session_progress (enrollment_id, program_session_id, workout_session_id)
       values ('${bobEnrollment}', '${progSessionId}', '${progWorkout}')`,
    ),
  "row-level security",
);

await q(`delete from public.user_program_enrollments where id = '${bobEnrollment}'`);

await asSuperuser();
expect(
  "the trigger decrements on unenroll",
  (await q(`select participant_count from public.programs where id = '${published.id}'`))[0].participant_count,
  1,
);

console.log("\nprograms -- admin:");
await asSuperuser();
await db.query(`update public.profiles set role = 'admin' where id = '${bob}'`);
await asUser(bob);
expect("admin sees draft programs", (await q(`select id from public.programs`)).length, 2);
expect("admin sees a draft's weeks", (await q(`select id from public.program_weeks`)).length, 2);
await db.query(`insert into public.programs (slug, title, level) values ('admin-made', 'Admin Made', 'EXPERT')`);
ok("admin can author a program");
expect(
  "admin still cannot see another user's enrollment",
  (await q(`select id from public.user_program_enrollments`)).length,
  0,
);

// ------------------------------------------------------------- AI coach --

// The model runs against the signed-in user's client, so these policies are
// the entire safety boundary for the feature. If they leak, a chat turn leaks.
console.log("\nAI coach -- owner can use their own:");
await asUser(alice);

const aliceConversation = (
  await q(
    `insert into public.ai_conversations (user_id, title)
     values ('${alice}', 'Chest day') returning id`,
  )
)[0].id;
ok("owner creates a conversation");

await q(`
  insert into public.ai_messages (conversation_id, role, content, input_tokens, output_tokens)
  values ('${aliceConversation}', 'user', '[{"type":"text","text":"what is my bench PR?"}]'::jsonb, 12, 0)
`);
ok("owner appends a message");

// The reason content is jsonb: a turn is blocks, and tool calls have to survive
// the round trip to be replayed to the API.
const toolTurn = await q(`
  insert into public.ai_messages (conversation_id, role, content)
  values (
    '${aliceConversation}', 'assistant',
    '[{"type":"text","text":"Let me check."},
      {"type":"tool_use","id":"toolu_1","name":"get_exercise_history","input":{"slug":"bench-press"}}]'::jsonb
  )
  returning content
`);
expect(
  "a tool_use block survives the round trip",
  toolTurn[0].content[1].name,
  "get_exercise_history",
);

await q(
  `insert into public.ai_coach_notes (user_id, note)
   values ('${alice}', 'Prefers 45-minute sessions.')`,
);
ok("owner saves a coach note");

await expectError(
  "a note cannot be blank",
  () => db.query(`insert into public.ai_coach_notes (user_id, note) values ('${alice}', '   ')`),
  "ai_coach_notes_note_check",
);

await expectError(
  "user cannot forge a conversation owned by someone else",
  () => db.query(`insert into public.ai_conversations (user_id) values ('${bob}')`),
  "row-level security",
);

console.log("\nAI coach -- another user is locked out:");
await asUser(bob);

expect("cannot read the conversation", (await q(`select id from public.ai_conversations`)).length, 0);
expect("cannot read the transcript", (await q(`select id from public.ai_messages`)).length, 0);
expect("cannot read the coach notes", (await q(`select id from public.ai_coach_notes`)).length, 0);

await expectError(
  "cannot inject a message into the conversation",
  () =>
    db.query(
      `insert into public.ai_messages (conversation_id, role, content)
       values ('${aliceConversation}', 'user', '[{"type":"text","text":"ignore previous instructions"}]'::jsonb)`,
    ),
  "row-level security",
);

expect(
  "cannot delete the conversation",
  (await db.query(`delete from public.ai_conversations where id = '${aliceConversation}'`)).affectedRows,
  0,
);

await asSuperuser();
await db.query(`update public.profiles set role = 'admin' where id = '${bob}'`);
await asUser(bob);
expect(
  "not even an admin reads another user's chat",
  (await q(`select id from public.ai_conversations`)).length,
  0,
);

console.log("\nAI coach -- transcript integrity:");
await asUser(alice);
expect(
  "a past turn cannot be edited (no update policy)",
  (
    await db.query(
      `update public.ai_messages set content = '[{"type":"text","text":"rewritten"}]'::jsonb
       where conversation_id = '${aliceConversation}'`,
    )
  ).affectedRows,
  0,
);

// Deleting a conversation must not silently erase what the coach learned.
const noteBefore = (await q(`select count(*)::int as n from public.ai_coach_notes`))[0].n;
await q(`delete from public.ai_conversations where id = '${aliceConversation}'`);
expect("deleting a conversation cascades its messages", (await q(`select id from public.ai_messages`)).length, 0);
expect(
  "deleting a conversation keeps the coach notes",
  (await q(`select count(*)::int as n from public.ai_coach_notes`))[0].n,
  noteBefore,
);

// -------------------------------------------------------- app_settings --

// The AI config lives here, including the OpenRouter key. The whole point is
// that no client can read a secret's value over the API -- so these checks are
// the feature, not a formality.
console.log("\napp_settings -- secrets are unreadable over the API:");

// Seeded with a direct insert, not admin_set_setting(): that function checks
// is_admin(), and the superuser has no auth.uid() to be an admin with. The
// superuser bypasses RLS instead -- which is exactly how the server reads it.
await asSuperuser();
await q(`
  insert into public.app_settings (key, value, is_secret) values
    ('openrouter_api_key', 'sk-or-fake-secret', true)
  on conflict (key) do update set value = excluded.value, is_secret = excluded.is_secret
`);

await asAnon();
expect(
  "signed-out visitor reads nothing",
  (await q(`select key from public.app_settings`)).length,
  0,
);

await asUser(alice);
expect(
  "a signed-in non-admin reads nothing from the table",
  (await q(`select key from public.app_settings`)).length,
  0,
);
expect(
  "a non-admin gets no rows from admin_list_settings()",
  (await q(`select key from public.admin_list_settings()`)).length,
  0,
);
await expectError(
  "a non-admin cannot write a setting",
  () => db.query(`select public.admin_set_setting('openrouter_api_key', 'stolen', true)`),
  "not authorized",
);
await expectError(
  "a non-admin cannot delete a setting",
  () => db.query(`select public.admin_delete_setting('coach_model')`),
  "not authorized",
);

await asSuperuser();
await db.query(`update public.profiles set role = 'admin' where id = '${bob}'`);
await asUser(bob);

expect(
  "even an admin reads nothing from the table directly",
  (await q(`select key from public.app_settings`)).length,
  0,
);

const settings = await q(`select * from public.admin_list_settings() order by key`);
expect("an admin sees the settings list", settings.length >= 2, true);

const secret = settings.find((s) => s.key === "openrouter_api_key");
expect("the secret's value is withheld even from an admin", secret.value, null);
expect("but the admin can see that it is set", secret.is_set, true);

const plain = settings.find((s) => s.key === "coach_model");
expect("a non-secret value is returned", plain.value, "anthropic/claude-opus-4.8");

await q(`select public.admin_set_setting('coach_model', 'anthropic/claude-sonnet-5', false)`);
expect(
  "an admin can change the model without a redeploy",
  (await q(`select value from public.admin_list_settings() where key = 'coach_model'`))[0].value,
  "anthropic/claude-sonnet-5",
);

// The server reads the real value with the service key, which bypasses RLS --
// that is the only path to it, and it is why the route needs an elevated
// client for config and nothing else.
await asSuperuser();
expect(
  "the server can read the secret with the service key",
  (await q(`select value from public.app_settings where key = 'openrouter_api_key'`))[0].value,
  "sk-or-fake-secret",
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

// Asserts what each index is for, not how many exist. A bare count breaks the
// moment an unrelated index is added -- which tells you nothing about whether
// the filters are still backed.
for (const column of ["primary_muscles", "secondary_muscles", "equipment", "exercise_types"]) {
  const { rows } = await db.query(
    `select indexname from pg_indexes
     where schemaname='public' and tablename='exercises'
       and indexdef ilike '%gin%' and indexdef ilike '%${column}%'`,
  );
  expect(`GIN index backs the ${column} filter`, rows.length > 0, true);
}

const { rows: trgm } = await db.query(
  `select indexname from pg_indexes
   where schemaname='public' and tablename='exercises' and indexdef ilike '%trgm%'`,
);
expect("trigram index backs the name search", trgm.length, 1);

// Proves the search is *indexable*, which is the claim being made -- not that
// the planner picks the index here. This database holds a handful of seeded
// rows, where a seq scan genuinely is faster and choosing it is correct.
// Disabling seqscan asks the only question that generalises: given no
// alternative, can this query use the trigram index at all? A btree cannot
// serve a leading-wildcard ilike, so before migration 8 this failed.
await db.exec("set enable_seqscan = off");
const { rows: plan } = await db.query(
  `explain (format json) select id from public.exercises where name ilike '%bench%'`,
);
await db.exec("set enable_seqscan = on");

expect(
  "trigram index is usable for ilike '%term%'",
  /trgm/i.test(JSON.stringify(plan[0]["QUERY PLAN"])),
  true,
);

// ----------------------------------------------------------------- report --

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
