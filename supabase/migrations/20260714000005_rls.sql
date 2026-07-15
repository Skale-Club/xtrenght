-- Row Level Security.
--
-- With the Supabase client the browser talks to PostgREST directly using the
-- user's JWT, so these policies -- not application code -- are the authorization
-- layer. Every table below is deny-by-default once RLS is enabled; anything not
-- granted by a policy is invisible.
--
-- Two conventions used throughout:
--   * auth.uid() is wrapped in a subselect. Postgres then evaluates it once per
--     query as an InitPlan instead of once per row.
--   * Policies are split per command rather than using `for all`, so a read path
--     never pays for a write predicate.

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.user_favorite_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.workout_sets enable row level security;

-- ---------------------------------------------------------------- profiles --

create policy "profiles are readable by their owner"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles are updatable by their owner"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert policy: rows come from the on_auth_user_created trigger, which runs
-- as definer and bypasses RLS. No delete policy: profiles die with auth.users
-- via the FK cascade.

-- --------------------------------------------------------------- exercises --

-- The catalogue is public on purpose -- it is browsable before signup.
create policy "published exercises are readable by anyone"
  on public.exercises for select
  to anon, authenticated
  using (is_published or public.is_admin());

create policy "exercises are writable by admins"
  on public.exercises for insert
  to authenticated
  with check (public.is_admin());

create policy "exercises are updatable by admins"
  on public.exercises for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "exercises are deletable by admins"
  on public.exercises for delete
  to authenticated
  using (public.is_admin());

-- ------------------------------------------------- user_favorite_exercises --

create policy "favorites are readable by their owner"
  on public.user_favorite_exercises for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "favorites are insertable by their owner"
  on public.user_favorite_exercises for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "favorites are deletable by their owner"
  on public.user_favorite_exercises for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- -------------------------------------------------------- workout_sessions --

create policy "sessions are readable by their owner"
  on public.workout_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "sessions are insertable by their owner"
  on public.workout_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- with check repeats the predicate so a row cannot be updated into another
-- user's ownership.
create policy "sessions are updatable by their owner"
  on public.workout_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "sessions are deletable by their owner"
  on public.workout_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------- workout_session_exercises --

-- Ownership is inherited from the parent session; these rows have no user_id of
-- their own. The exists() hits workout_sessions_user_started_idx.
create function public.owns_workout_session(session_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_sessions s
    where s.id = session_id
      and s.user_id = (select auth.uid())
  );
$$;

create policy "session exercises are readable by the session owner"
  on public.workout_session_exercises for select
  to authenticated
  using (public.owns_workout_session(workout_session_id));

create policy "session exercises are insertable by the session owner"
  on public.workout_session_exercises for insert
  to authenticated
  with check (public.owns_workout_session(workout_session_id));

create policy "session exercises are updatable by the session owner"
  on public.workout_session_exercises for update
  to authenticated
  using (public.owns_workout_session(workout_session_id))
  with check (public.owns_workout_session(workout_session_id));

create policy "session exercises are deletable by the session owner"
  on public.workout_session_exercises for delete
  to authenticated
  using (public.owns_workout_session(workout_session_id));

-- ------------------------------------------------------------ workout_sets --

create function public.owns_workout_session_exercise(session_exercise_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.workout_session_exercises se
    join public.workout_sessions s on s.id = se.workout_session_id
    where se.id = session_exercise_id
      and s.user_id = (select auth.uid())
  );
$$;

create policy "sets are readable by the session owner"
  on public.workout_sets for select
  to authenticated
  using (public.owns_workout_session_exercise(workout_session_exercise_id));

create policy "sets are insertable by the session owner"
  on public.workout_sets for insert
  to authenticated
  with check (public.owns_workout_session_exercise(workout_session_exercise_id));

create policy "sets are updatable by the session owner"
  on public.workout_sets for update
  to authenticated
  using (public.owns_workout_session_exercise(workout_session_exercise_id))
  with check (public.owns_workout_session_exercise(workout_session_exercise_id));

create policy "sets are deletable by the session owner"
  on public.workout_sets for delete
  to authenticated
  using (public.owns_workout_session_exercise(workout_session_exercise_id));
