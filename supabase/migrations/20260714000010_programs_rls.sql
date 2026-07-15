-- RLS for programs.
--
-- The template tree is public once PUBLISHED and admin-only otherwise. The
-- progress tables are private to their owner, like everything else a user logs.

alter table public.programs enable row level security;
alter table public.program_weeks enable row level security;
alter table public.program_sessions enable row level security;
alter table public.program_session_exercises enable row level security;
alter table public.program_suggested_sets enable row level security;
alter table public.user_program_enrollments enable row level security;
alter table public.user_session_progress enable row level security;

-- ------------------------------------------------------------- template --

-- Visibility is inherited down the tree: a week is readable if its program is.
-- Definer + stable so the checks below do not recurse through programs' own
-- policy on every row.
create function public.program_is_readable(program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.programs p
    where p.id = program_id
      and (p.visibility = 'PUBLISHED' or public.is_admin())
  );
$$;

create function public.week_is_readable(week_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_weeks w
    join public.programs p on p.id = w.program_id
    where w.id = week_id
      and (p.visibility = 'PUBLISHED' or public.is_admin())
  );
$$;

create function public.program_session_is_readable(session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_sessions s
    join public.program_weeks w on w.id = s.week_id
    join public.programs p on p.id = w.program_id
    where s.id = session_id
      and (p.visibility = 'PUBLISHED' or public.is_admin())
  );
$$;

create policy "published programs are readable by anyone"
  on public.programs for select
  to anon, authenticated
  using (visibility = 'PUBLISHED' or public.is_admin());

create policy "programs are writable by admins"
  on public.programs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "program weeks follow their program's visibility"
  on public.program_weeks for select
  to anon, authenticated
  using (public.program_is_readable(program_id));

create policy "program weeks are writable by admins"
  on public.program_weeks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "program sessions follow their program's visibility"
  on public.program_sessions for select
  to anon, authenticated
  using (public.week_is_readable(week_id));

create policy "program sessions are writable by admins"
  on public.program_sessions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "program session exercises follow their program's visibility"
  on public.program_session_exercises for select
  to anon, authenticated
  using (public.program_session_is_readable(program_session_id));

create policy "program session exercises are writable by admins"
  on public.program_session_exercises for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "suggested sets follow their program's visibility"
  on public.program_suggested_sets for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.program_session_exercises se
      where se.id = program_session_exercise_id
        and public.program_session_is_readable(se.program_session_id)
    )
  );

create policy "suggested sets are writable by admins"
  on public.program_suggested_sets for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -------------------------------------------------------- user progress --

create policy "enrollments are readable by their owner"
  on public.user_program_enrollments for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "enrollments are insertable by their owner"
  on public.user_program_enrollments for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    -- No enrolling in a draft: without this the program tree would be
    -- unreadable to the very user who just joined it.
    and public.program_is_readable(program_id)
  );

create policy "enrollments are deletable by their owner"
  on public.user_program_enrollments for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.owns_enrollment(enrollment_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_program_enrollments e
    where e.id = enrollment_id
      and e.user_id = (select auth.uid())
  );
$$;

create policy "session progress is readable by its owner"
  on public.user_session_progress for select
  to authenticated
  using (public.owns_enrollment(enrollment_id));

create policy "session progress is insertable by its owner"
  on public.user_session_progress for insert
  to authenticated
  with check (
    public.owns_enrollment(enrollment_id)
    -- The linked workout must also be the caller's, or a user could attach
    -- someone else's session to their own program progress.
    and public.owns_workout_session(workout_session_id)
  );

create policy "session progress is deletable by its owner"
  on public.user_session_progress for delete
  to authenticated
  using (public.owns_enrollment(enrollment_id));

-- No update policy: the row is a link, written once. Completion is read from
-- the workout session's ended_at, so there is nothing here to change.
