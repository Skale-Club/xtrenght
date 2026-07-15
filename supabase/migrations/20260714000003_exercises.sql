-- Exercise catalogue.
--
-- workout-cool models attributes as an EAV triangle (exercise_attribute_names +
-- exercise_attribute_values + exercise_attributes). That indirection buys
-- nothing here: its attribute names are themselves a hardcoded enum, so adding a
-- category needs a migration either way — EAV's cost without its flexibility.
-- One typed array per category collapses three joins into a GIN index scan and
-- keeps the CSV import a straight pivot of attribute_name -> column.

create table public.exercises (
  id uuid primary key default gen_random_uuid(),

  -- Integer key from the workout-cool CSV. Nullable (exercises created in-app
  -- have none) and unique, so re-importing updates instead of duplicating.
  legacy_id integer unique,

  name text not null,
  slug text not null unique,

  -- Long-form copy, stored as the HTML the source dataset ships.
  description text,
  introduction text,

  full_video_url text,
  full_video_image_url text,

  exercise_types public.exercise_type[] not null default '{}',
  primary_muscles public.muscle_group[] not null default '{}',
  secondary_muscles public.muscle_group[] not null default '{}',
  equipment public.equipment[] not null default '{}',
  mechanics public.mechanics_type,

  is_published boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

-- Containment filters ("chest exercises doable with a dumbbell") need GIN;
-- btree cannot serve the && / @> array operators.
create index exercises_primary_muscles_idx on public.exercises using gin (primary_muscles);
create index exercises_secondary_muscles_idx on public.exercises using gin (secondary_muscles);
create index exercises_equipment_idx on public.exercises using gin (equipment);
create index exercises_types_idx on public.exercises using gin (exercise_types);

-- Catalogue browsing always filters to published rows first.
create index exercises_published_name_idx on public.exercises (name) where is_published;

create table public.user_favorite_exercises (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- The PK covers user-first lookups; this covers "who favourited this exercise".
create index user_favorite_exercises_exercise_idx on public.user_favorite_exercises (exercise_id);
