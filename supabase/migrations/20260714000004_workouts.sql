-- Workout logging: session -> exercises -> sets.

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  started_at timestamptz not null default now(),
  ended_at timestamptz,

  -- Not derived from ended_at - started_at: a paused session has less elapsed
  -- training time than wall-clock, and only the client knows the difference.
  duration_seconds integer check (duration_seconds >= 0),

  rating smallint check (rating between 1 and 5),
  rating_comment text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workout_sessions_ends_after_start check (ended_at is null or ended_at >= started_at)
);

create trigger workout_sessions_set_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

-- Drives both the history list and every RLS ownership check.
create index workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

create table public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,

  -- Named order_index rather than workout-cool's "order", which is a reserved
  -- word and would need quoting at every call site.
  order_index integer not null check (order_index >= 0),

  created_at timestamptz not null default now(),

  unique (workout_session_id, order_index)
);

create index workout_session_exercises_exercise_idx
  on public.workout_session_exercises (exercise_id);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_session_exercise_id uuid not null
    references public.workout_session_exercises (id) on delete cascade,

  set_index integer not null check (set_index >= 0),

  -- What this set is meant to measure; drives which inputs the UI renders.
  types public.workout_set_type[] not null default '{}',

  -- workout-cool stores these as positional arrays (valuesInt/valuesSec/units
  -- indexed in lockstep with types). That makes the headline query of any
  -- workout app -- "my heaviest bench" -- unindexable and unaggregatable,
  -- because the weight's array position varies per row. Explicit columns keep
  -- max(weight) and sum(reps * weight) as ordinary SQL.
  reps integer check (reps >= 0),
  weight numeric(6, 2) check (weight >= 0),
  weight_unit public.weight_unit,
  duration_seconds integer check (duration_seconds >= 0),

  completed boolean not null default false,

  created_at timestamptz not null default now(),

  unique (workout_session_exercise_id, set_index),

  -- A weight without its unit is unreadable, and a unit without a weight is noise.
  constraint workout_sets_weight_needs_unit check (
    (weight is null) = (weight_unit is null)
  )
);

create index workout_sets_session_exercise_idx
  on public.workout_sets (workout_session_exercise_id, set_index);

-- Personal-record and volume lookups scan completed weighted sets.
create index workout_sets_completed_weight_idx
  on public.workout_sets (weight desc)
  where completed and weight is not null;
