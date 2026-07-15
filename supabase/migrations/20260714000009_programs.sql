-- Training programs.
--
-- Adapted from workout-cool's model. The idea worth keeping is the split: a
-- program is a TEMPLATE (what you should do) and a workout_session is a LOG
-- (what you did). They meet at exactly one row, user_session_progress, and
-- neither overwrites the other.
--
-- Four things are done differently, each noted at the table it affects.

create type public.program_level as enum ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

create type public.program_visibility as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- ------------------------------------------------------------- template --

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  category text,
  image_url text,
  level public.program_level not null default 'BEGINNER',
  equipment public.equipment[] not null default '{}',

  -- The author's intent for a session's length. Everything else workout-cool
  -- stores here -- durationWeeks, sessionsPerWeek -- is derivable by counting
  -- the weeks and sessions actually built, so it is not stored: a program with
  -- durationWeeks = 4 and three weeks of content is a lie the schema allows.
  session_duration_min integer check (session_duration_min > 0),

  visibility public.program_visibility not null default 'DRAFT',

  -- Denormalised on purpose, and maintained by a trigger below rather than by
  -- application code. It cannot be derived at read time: enrollments are
  -- RLS-scoped to their owner, so counting them from a public page would return
  -- 1 for the enrolled user and 0 for everyone else.
  participant_count integer not null default 0 check (participant_count >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

create index programs_published_idx on public.programs (created_at desc)
  where visibility = 'PUBLISHED';
create index programs_equipment_idx on public.programs using gin (equipment);

create table public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  week_number integer not null check (week_number > 0),
  title text,
  description text,
  created_at timestamptz not null default now(),

  unique (program_id, week_number)
);

create table public.program_sessions (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.program_weeks (id) on delete cascade,
  session_number integer not null check (session_number > 0),
  slug text not null,
  title text not null,
  description text,
  estimated_minutes integer check (estimated_minutes > 0),
  created_at timestamptz not null default now(),

  unique (week_id, session_number),
  unique (week_id, slug)
);

create table public.program_session_exercises (
  id uuid primary key default gen_random_uuid(),
  program_session_id uuid not null references public.program_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  order_index integer not null check (order_index >= 0),
  instructions text,
  created_at timestamptz not null default now(),

  unique (program_session_id, order_index)
);

create index program_session_exercises_exercise_idx
  on public.program_session_exercises (exercise_id);

-- The prescription: 3 x 8 at 80 kg. Mirrors workout_sets column for column,
-- minus `completed` -- a suggestion has not happened yet.
--
-- workout-cool reuses its positional arrays here (valuesInt/valuesSec/units).
-- Same objection as for logged sets: the weight's position varies per row, so
-- "which programs prescribe over 100 kg" is not a query you can write.
create table public.program_suggested_sets (
  id uuid primary key default gen_random_uuid(),
  program_session_exercise_id uuid not null
    references public.program_session_exercises (id) on delete cascade,
  set_index integer not null check (set_index >= 0),

  types public.workout_set_type[] not null default '{}',
  reps integer check (reps >= 0),
  weight numeric(6, 2) check (weight >= 0),
  weight_unit public.weight_unit,
  duration_seconds integer check (duration_seconds >= 0),

  unique (program_session_exercise_id, set_index),

  constraint program_suggested_sets_weight_needs_unit check (
    (weight is null) = (weight_unit is null)
  )
);

-- --------------------------------------------------------- user progress --

create table public.user_program_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  enrolled_at timestamptz not null default now(),

  -- workout-cool also stores currentWeek, currentSession, completedSessions and
  -- a completedAt on the enrollment, and recomputes them in application code on
  -- every completion. All four are derivable from the progress rows below, and
  -- storing them means they can disagree with reality -- which theirs does:
  -- merely *starting* a session advances their cursor, so abandoning one leaves
  -- the enrollment pointing at work you never did.
  --
  -- Here the cursor is "the first session with no finished workout", computed
  -- on read. There is nothing to keep in sync.

  unique (user_id, program_id)
);

create index user_program_enrollments_program_idx
  on public.user_program_enrollments (program_id);

-- The single point where template meets log.
create table public.user_session_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null
    references public.user_program_enrollments (id) on delete cascade,
  program_session_id uuid not null
    references public.program_sessions (id) on delete cascade,

  -- NOT NULL, and written when the session starts -- not when it completes, as
  -- workout-cool does. Linking at the end means a workout in progress does not
  -- know which program it belongs to, so closing the app mid-session loses the
  -- connection.
  --
  -- This is also what removes their completion endpoint entirely: a program
  -- session is finished when its workout has ended_at. No second write to race,
  -- no counter to drift.
  workout_session_id uuid not null unique
    references public.workout_sessions (id) on delete cascade,

  created_at timestamptz not null default now(),

  unique (enrollment_id, program_session_id)
);

-- --------------------------------------------------- participant counter --

-- Atomic, and it decrements. workout-cool increments this from the enroll
-- route and has no path that ever puts it back.
create function public.sync_program_participant_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.programs
      set participant_count = participant_count + 1
      where id = new.program_id;
    return new;
  else
    update public.programs
      set participant_count = greatest(0, participant_count - 1)
      where id = old.program_id;
    return old;
  end if;
end;
$$;

create trigger user_program_enrollments_sync_count
  after insert or delete on public.user_program_enrollments
  for each row execute function public.sync_program_participant_count();
