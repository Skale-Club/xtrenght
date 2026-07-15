# Xtrenght

Workout tracking app. Next.js 16 (App Router) + Supabase (Postgres, Auth, RLS), TypeScript, Tailwind 4.

The data model is adapted from [workout-cool](https://github.com/Snouzy/workout-cool) — see
[Schema decisions](#schema-decisions) for what was kept, what changed, and why.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in from your Supabase project
pnpm dev
```

The app runs at http://localhost:3000. With a filled-in `.env.local` it talks to the live project
and the catalogue renders immediately — the schema and seed are already applied.

### Applying migrations

The schema in `supabase/migrations/` is already live on the project. To apply new migrations:

```bash
supabase db push --db-url "$SUPABASE_DB_URL"    # SUPABASE_DB_URL comes from .env.local
```

Two things that cost time the first time round, both already solved in `.env.local`:

**Use the session pooler, not the direct connection.** `db.<ref>.supabase.co` resolves to IPv6
only. If your network has no IPv6 route the host is simply unreachable, and the failure looks like
a dead project rather than a routing problem. The pooler is IPv4. Its username is `postgres.<ref>`,
not `postgres`, and its hostname prefix is not always `aws-0` — this project sits behind `aws-1`.
Copy the string from Dashboard → Connect → Session pooler instead of assembling it by hand.

**`supabase link` needs the CLI logged into the account that owns the project.** If
`supabase projects list` doesn't show it, `link` fails with `Not Found` or a privileges error, and
`pnpm db:push` / `pnpm db:types` (which rely on a link) won't work. The `--db-url` form above needs
no account at all — it authenticates with the database password.

`pnpm db:types` additionally needs Docker running: the generator runs `postgres-meta` in a
container. Without it, edit `src/shared/types/database.types.ts` by hand and verify against the live
schema.

**Local stack instead** (needs Docker):

```bash
supabase start        # prints the local URL and keys for .env.local
pnpm db:reset         # applies migrations + supabase/seed.sql
```

### The exercise catalogue

876 exercises are already loaded, each with demonstration images, muscles, equipment, force and
difficulty. Every step is idempotent — re-running updates in place:

```bash
pnpm db:import-catalogue                     # free-exercise-db (873 exercises, the bulk)
pnpm db:rehost-images                        # mirror images into Supabase Storage
pnpm db:import-exercises data/exercises.csv  # a workout-cool CSV export, if you get one
```

**Where the data comes from.** workout-cool's own catalogue is not public — their repo ships only
`data/sample-exercises.csv` with 3 exercises (those 3 are in `supabase/seed.sql`). The catalogue
instead comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db): 873 exercises
under the **Unlicense**, i.e. public domain, no attribution required. wger was the other candidate
and was rejected — its data is share-alike licensed, which would impose terms on anything built
with it.

`scripts/import-free-exercise-db.mts` maps every value in that dataset onto our enums explicitly
and **throws on anything unmapped**, rather than dropping it. A silently missing muscle makes an
exercise unfindable, which is worse than a failed import.

The two sources dedupe against each other: both upsert on `slug`.

**Images live in our own Storage bucket**, not hotlinked. The import lands them on
`raw.githubusercontent.com`; `pnpm db:rehost-images` mirrors all 1,746 into the public
`exercise-images` bucket (94 MB) and repoints `image_urls`. That run is resumable — it only touches
rows still pointing at GitHub and rewrites each row only after its uploads land, so an interrupted
run continues rather than corrupting.

Hotlinking would have meant no uptime guarantee, GitHub's raw-content rate limits, and a catalogue
that breaks if that repo moves.

## Architecture

Feature-Sliced Design, the same layering workout-cool uses. Imports flow one direction only:
`app → widgets → features → entities → shared`.

```
src/
├── app/           Next.js routes and pages
├── widgets/       Composed UI blocks (site header)
├── features/      User-facing actions (auth, workout-session)
├── entities/      Domain data access (exercise, workout)
├── shared/        Supabase clients, generated DB types, UI primitives
└── proxy.ts       Session refresh + route gating
supabase/
├── migrations/    The schema. Source of truth.
├── seed.sql       Three sample exercises for local dev
└── tests/         Schema + RLS tests (pnpm test:db)
src/app/admin/     Program authoring (RLS is the boundary; the layout is convenience)
scripts/
├── import-free-exercise-db.mts   JSON -> exercises (the main catalogue)
├── upload-exercise-images.mts    mirror images into Supabase Storage
└── import-exercises.mts          workout-cool CSV -> exercises pivot
```

### How auth works

`src/proxy.ts` runs on every navigation, refreshes the Supabase session, and redirects signed-out
users away from private routes. It is the only place in the request lifecycle that can write
refreshed auth cookies, which is why Server Components can safely ignore cookie writes.

Two rules worth not relearning the hard way:

- **Use `getUser()`, never `getSession()` on the server.** `getSession()` only decodes the cookie;
  `getUser()` revalidates it against Supabase. Only the latter is trustworthy.
- **Don't put code between `createServerClient` and `getUser()` in the proxy.** It causes
  intermittent, near-undebuggable logouts.

### How authorization works

There is no authorization code in the app layer — it is all RLS policies in
`supabase/migrations/20260714000005_rls.sql`. The browser talks to PostgREST with the user's JWT, so
Postgres is what stands between one user's data and another's. Queries therefore skip
`.eq("user_id", ...)` deliberately: the policy already scopes rows, and a second copy of the rule in
TypeScript would be the weaker one.

Consequence: **a new table is wide open until it has RLS enabled and policies written.** That is the
one thing this codebase asks you to remember.

## Schema decisions

Kept from workout-cool: the domain shape (exercises → sessions → session exercises → sets), the
attribute categories, and every enum *value*, so their CSV exports import without a mapping table.

Four things changed:

**One enum per category instead of one giant enum.** workout-cool puts muscles, equipment, and
exercise types in a single `ExerciseAttributeValueEnum`, which lets a muscle be stored as equipment.
Split into `muscle_group` / `equipment` / `exercise_type` / `mechanics_type`, that is a type error.

**Typed arrays instead of the EAV triangle.** They model attributes across three join tables
(`exercise_attribute_names` + `exercise_attribute_values` + `exercise_attributes`). The tell that
this indirection isn't earning its keep: the attribute *names* are themselves a hardcoded enum, so
adding a category needs a migration anyway — EAV's cost without its flexibility. One
`muscle_group[]` column per category, with GIN indexes, turns three joins into an index scan and
keeps the CSV import a straight pivot.

**Explicit set columns instead of positional arrays.** This is the significant one. workout-cool
stores a set as parallel arrays (`types[]`, `valuesInt[]`, `valuesSec[]`, `units[]`) indexed in
lockstep, so a weight's position varies from row to row. That makes the headline query of any
workout app — *"what's my heaviest bench?"* — impossible to index or aggregate in SQL. Explicit
`reps`, `weight`, `weight_unit`, `duration_seconds` columns keep `max(weight)` and
`sum(weight * reps)` as ordinary SQL, which is what `getSessionSummary()` relies on.

**Added for the catalogue** (migration 6): `LOWER_BACK` and `MIDDLE_BACK`, because free-exercise-db
distinguishes them and collapsing both into `BACK` would flatten 229 exercises; plus `force`
(push/pull/static — the basis of push/pull/legs splits), `level`, and `image_urls`.

**Left out for now:** training programs, billing/subscriptions, RevenueCat webhooks, and the
six-language translation columns (`titleEn`, `titleEs`, `titlePt`…). The app is English-only, so
each field is one column. All of it can come back as new migrations when there's a reason.

## Programs

Adapted from workout-cool's model, which gets the central idea right: a program is a **template**
(`programs -> program_weeks -> program_sessions -> program_session_exercises ->
program_suggested_sets`) and a workout is a **log**. They meet at exactly one row,
`user_session_progress`, and neither overwrites the other. Editing a program never rewrites what
someone already lifted.

Programs are admin-authored: `/admin/programs` creates them, builds the week/session/exercise tree,
and flips DRAFT -> PUBLISHED. Visibility is inherited down the tree by RLS, so a draft's weeks and
sessions are invisible even when addressed directly by id.

Four deliberate departures from their implementation:

**There is no "complete session" step.** `user_session_progress.workout_session_id` is written when
the session *starts*, not when it finishes, so a program session is done exactly when its workout
has `ended_at`. workout-cool instead POSTs to a completion route that does `update` -> `count` ->
`update` in three non-transactional statements: two concurrent completions read the same count, and
a crash between them leaves the enrollment describing work that did not happen. Here there is no
second write to race.

**The cursor is derived, not stored.** They keep `currentWeek`, `currentSession`,
`completedSessions` and `completedAt` on the enrollment and recompute them in application code.
All four follow from the progress rows, and theirs drift: *starting* a session advances their
cursor, so abandoning one leaves the pointer wrong. Ours is "the first session with no finished
workout", computed on read. `user_program_enrollments` has four columns: id, user_id, program_id,
enrolled_at.

**Linking at start, not completion.** Theirs means a workout in progress does not know which program
it belongs to -- close the app mid-session and the connection is gone.

**`participant_count` is a trigger, not a counter.** It cannot be derived at read time (enrollments
are RLS-scoped, so a public page would count only its own viewer), so it stays denormalised -- but
the database maintains it atomically, and it decrements. Theirs increments from the enroll route and
has no path that puts it back.

Suggested sets use explicit `reps`/`weight` columns, for the same reason logged sets do.

## Testing the schema

```bash
pnpm test:db
```

Applies every migration to a throwaway in-memory Postgres (PGlite) and runs 46 checks in about two
seconds. No Docker, no cloud project, nothing to clean up.

Most of it tests RLS, because RLS is the authorization layer here and it fails *silently* — a broken
policy doesn't throw, it just returns rows it shouldn't. The suite asserts the isolation that
matters: a second user cannot read, update, delete, or inject sets into another's sessions, and a
signed-out visitor sees published exercises but no workout data. It also covers the signup trigger,
every constraint, and the aggregates the dashboard depends on.

The suite was itself checked by breaking RLS on `workout_sessions` on purpose: 9 checks went red,
including the read leak. Run it after any schema change.

The same isolation was then re-verified against the **live project** with real JWTs, not just
PGlite: a signed-out visitor reads the catalogue but zero sessions and zero profiles; a second
signed-in user reads zero of the first user's sessions, cannot update them, and cannot forge a
session owned by someone else (`42501`). The signup trigger and the `auth.users` → profiles →
sessions delete cascade were confirmed there too.

What's stubbed: the `auth` schema, the `anon`/`authenticated`/`service_role` roles, and the default
privileges a real Supabase project bootstraps. `auth.uid()` reads a session variable instead of a
JWT; everything downstream of it is real Postgres.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test:db` | Schema + RLS tests against in-memory Postgres |
| `pnpm db:push` | Apply migrations to the linked project |
| `pnpm db:reset` | Reset local DB and re-apply migrations + seed |
| `pnpm db:types` | Regenerate DB types from the live schema |
| `pnpm db:import-catalogue` | Import the free-exercise-db catalogue (873 exercises) |
| `pnpm db:rehost-images` | Mirror exercise images into Supabase Storage |
| `pnpm db:import-exercises <csv>` | Import a workout-cool exercise CSV |

## What's here, and what isn't

The loop closes: sign up, browse 876 exercises, start a workout, add exercises from a typeahead,
log sets, finish, and see the volume on your dashboard.

Working: email/password auth with password reset, session refresh and route gating; a paginated
876-exercise catalogue with self-hosted images, trigram-indexed search and muscle-group filters;
favourites; the workout logger (add/remove exercises, add/edit/delete sets, kg/lbs toggle, rest
timer, resume an unfinished session); per-exercise history with personal records; session ratings;
and a dashboard with session/set/volume stats.

Verified end to end against the live project, not just in tests: signing in through the browser,
logging 82.5 kg x 8, finishing, and confirming the row in Postgres and 660 kg on the dashboard.

Not built yet: an admin UI for the exercise catalogue, social/sharing, and premium/billing --
`is_premium` flags were deliberately left out until there is something to charge for.

Known limits worth naming:

- **Sets save on blur, not per keystroke.** Deliberate -- a round trip per character would lag the
  inputs mid-set -- but it means a value typed and never blurred is not saved.
- **Duration is wall-clock.** Pausing is not modelled, so a workout you walk away from records the
  gap as training time.
- **Personal records are per exercise, by top weight.** Estimated 1RM, rep PRs and volume PRs are
  not computed, and a PR at 5 reps outranks the same weight at 8 -- which is wrong, but wrong in a
  way nobody has asked to fix yet.
- **The rest timer does not survive a reload.** It is a live prompt, not a record.

> Note: `src/app/exercises/[slug]/page.tsx` renders the dataset's HTML with
> `dangerouslySetInnerHTML`. Fine for admin-curated content; if user-submitted exercises are ever
> added, sanitise first.
