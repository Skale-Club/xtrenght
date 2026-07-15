-- Fields needed to carry the free-exercise-db catalogue (873 exercises, public
-- domain: github.com/yuhonas/free-exercise-db) without discarding data.

-- That dataset separates the lower and middle back, which our muscle_group did
-- not. Collapsing both into BACK would flatten 229 exercises and lose a
-- distinction people actually train and search by.
--
-- Adding a value to an enum is additive: existing rows and queries are
-- untouched. It cannot be undone in place, though -- removing an enum value
-- requires rewriting the type.
alter type public.muscle_group add value if not exists 'LOWER_BACK';
alter type public.muscle_group add value if not exists 'MIDDLE_BACK';

-- Push/pull/static. The basis of push/pull/legs splits, so it earns a column
-- rather than living in a tag soup.
create type public.exercise_force as enum ('PUSH', 'PULL', 'STATIC');

create type public.exercise_level as enum ('BEGINNER', 'INTERMEDIATE', 'EXPERT');

alter table public.exercises
  -- Nullable: the source leaves force blank on 29 and mechanic on 87 exercises.
  -- A null here means unknown, which is honest; a default would invent data.
  add column force public.exercise_force,
  add column level public.exercise_level,

  -- Demonstration stills, ordered. text[] rather than a child table: they are
  -- read as a unit with the exercise and never queried on their own.
  --
  -- These currently point at raw.githubusercontent.com. Fine for development,
  -- wrong for production -- it hotlinks a third party and is rate-limited.
  -- Rehosting to Supabase Storage only changes these strings.
  add column image_urls text[] not null default '{}';

-- The dataset's own ids are strings ("3_4_Sit-Up"), so legacy_id (integer, from
-- the workout-cool CSV) cannot key them. Imports upsert on slug instead, which
-- is already unique -- and which also dedupes across the two sources.
