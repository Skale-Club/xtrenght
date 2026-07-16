-- What the coach needs to know about you that your logged sets cannot say.
--
-- Until now the coach saw workouts and nothing else: no equipment, no
-- bodyweight, no goal. So it prescribed barbell work to people with two
-- dumbbells and refused to reason about load because it had no scale to
-- reason against. This is the missing half of the input.

-- ---------------------------------------------------------------- goal ------

create type public.training_goal as enum (
  'STRENGTH',
  'HYPERTROPHY',
  'ENDURANCE',
  'WEIGHT_LOSS',
  'GENERAL_FITNESS'
);

-- ------------------------------------------------------------ profiles ------

alter table public.profiles
  -- Deliberately the SAME enum exercises use, not a parallel vocabulary. That
  -- is what makes "can I do this?" a single indexed array operator --
  -- exercises.equipment <@ profiles.available_equipment -- instead of a join
  -- through a mapping table nobody would keep in sync.
  --
  -- NULL and '{}' mean different things and both are reachable:
  --   NULL -> never answered. Show everything; the filter is off.
  --   '{}' -> answered "I have nothing". Only the 77 no-equipment exercises
  --           and the OTHER bucket survive, which is correct for a hotel room.
  add column available_equipment public.equipment[],

  add column training_goal public.training_goal,

  -- 1-7. Anything outside that is a typo, not a training plan.
  add column sessions_per_week smallint
    constraint profiles_sessions_per_week_range
    check (sessions_per_week is null or sessions_per_week between 1 and 7),

  -- Free text on purpose. "Right shoulder hurts on flat bench, fine on
  -- incline" does not fit a checkbox, and the coach reads prose natively.
  add column limitations text,

  -- Distinguishes "skipped onboarding" from "never saw it". Without this we
  -- would nag someone who deliberately answered nothing.
  add column onboarded_at timestamptz;

-- Dead since the day it was created: carried over from workout-cool's model,
-- written by nothing, read by nothing. The columns above are what it was
-- gesturing at, typed properly.
alter table public.profiles drop column onboarding_preferences;

-- -------------------------------------------------- body_weight_entries -----

-- A row per weigh-in rather than a column on profiles.
--
-- Bodyweight is the scale every relative number needs: 62.5 kg means one thing
-- at 70 kg bodyweight and another at 95, and a push-up is not zero volume. But
-- it moves, and a column would overwrite the past every time you stepped on the
-- scale. History is the thing you cannot reconstruct later, so it is recorded
-- from the first entry.
create table public.body_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  weight numeric(6, 2) not null check (weight > 0 and weight < 1000),
  weight_unit public.weight_unit not null default 'kg',
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Every read is "this user's entries, newest first".
create index body_weight_entries_user_measured_idx
  on public.body_weight_entries (user_id, measured_at desc);

alter table public.body_weight_entries enable row level security;

create policy "body weight is readable by its owner"
  on public.body_weight_entries for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "body weight is insertable by its owner"
  on public.body_weight_entries for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "body weight is updatable by its owner"
  on public.body_weight_entries for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "body weight is deletable by its owner"
  on public.body_weight_entries for delete
  to authenticated
  using ((select auth.uid()) = user_id);
