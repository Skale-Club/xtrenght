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

The app runs at http://localhost:3000, but every page that touches data needs a database first.

### Point it at a database

Nothing has been applied to a Supabase project yet — `supabase/migrations/` is the whole schema,
waiting for a target. Pick one:

**Cloud project**

```bash
supabase login
supabase link --project-ref <your-project-ref>
pnpm db:push          # applies supabase/migrations in order
pnpm db:types         # regenerates src/shared/types/database.types.ts from the live schema
```

**Local stack** (needs Docker running)

```bash
supabase start        # prints the local URL and keys for .env.local
pnpm db:reset         # applies migrations + supabase/seed.sql
```

### Fill the exercise catalogue

The catalogue starts empty. `supabase/seed.sql` inserts three exercises so the UI has something to
render; for a real catalogue you need a CSV in workout-cool's export format:

```bash
pnpm db:import-exercises data/exercises.csv
```

**The full workout-cool exercise database is not public.** Their repo ships only
`data/sample-exercises.csv` with 3 exercises — the large catalogue on workout.cool is not in the
repository. Sourcing it is an open task; the importer is ready for the format either way.

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
scripts/
└── import-exercises.mts   CSV -> exercises pivot
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

**Left out for now:** training programs, billing/subscriptions, RevenueCat webhooks, and the
six-language translation columns (`titleEn`, `titleEs`, `titlePt`…). The app is English-only, so
each field is one column. All of it can come back as new migrations when there's a reason.

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
| `pnpm db:import-exercises <csv>` | Import a workout-cool exercise CSV |

## What's here, and what isn't

Working: email/password signup and sign-in, session refresh, route gating, public exercise
catalogue with muscle filters and search, exercise detail pages, dashboard with volume/set/session
stats, and starting a workout session.

Not built yet: the set-logging UI (the actions in
`src/features/workout-session/api/workout-actions.ts` exist and are RLS-tested, but no screen calls
`addExerciseToSession` yet), favourites, and password reset.

> Note: `src/app/exercises/[slug]/page.tsx` renders the dataset's HTML with
> `dangerouslySetInnerHTML`. Fine for admin-curated content; if user-submitted exercises are ever
> added, sanitise first.
