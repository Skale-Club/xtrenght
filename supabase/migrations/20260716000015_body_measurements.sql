-- Progress is more than one number.
--
-- Bodyweight came first (body_weight_entries), but a waist, an arm, a body-fat
-- percentage all track the same shape: a value, a unit, a date, kept as history
-- because a column would overwrite the past on every entry. So they share one
-- table keyed by a type, rather than a column -- or a table -- per metric. A new
-- measurement kind is a new enum value, not a migration.

create type public.measurement_type as enum (
  'WEIGHT',
  'BODY_FAT',
  'NECK',
  'SHOULDERS',
  'CHEST',
  'ARM',
  'FOREARM',
  'WAIST',
  'HIP',
  'THIGH',
  'CALF'
);

-- Weight is kg/lbs, circumferences are cm/in, body fat is a percentage. One enum
-- covers all of them; which units are valid for which type is enforced in the
-- app, not here -- the database would need a per-type check that buys little.
create type public.measurement_unit as enum ('kg', 'lbs', 'cm', 'in', 'percent');

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.measurement_type not null,
  value numeric(7, 2) not null check (value > 0 and value < 10000),
  unit public.measurement_unit not null,
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Every read is "this user's entries of one type, newest first" -- the shape a
-- chart and a "latest value" both want.
create index body_measurements_user_type_measured_idx
  on public.body_measurements (user_id, type, measured_at desc);

alter table public.body_measurements enable row level security;

create policy "measurements are readable by their owner"
  on public.body_measurements for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "measurements are insertable by their owner"
  on public.body_measurements for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "measurements are updatable by their owner"
  on public.body_measurements for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "measurements are deletable by their owner"
  on public.body_measurements for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Carry existing weigh-ins over as WEIGHT. weight_unit ('kg','lbs') is a subset
-- of measurement_unit, so the text cast is total.
insert into public.body_measurements (user_id, type, value, unit, measured_at, created_at)
select user_id, 'WEIGHT', weight, weight_unit::text::public.measurement_unit, measured_at, created_at
from public.body_weight_entries;

-- body_weight_entries is now superseded -- nothing reads or writes it after this
-- migration. It is deliberately NOT dropped here: dropping a table on the live
-- database is a destructive operation gated by policy, so the retirement is a
-- separate, explicitly-approved step. Until then it sits empty and unreferenced.
