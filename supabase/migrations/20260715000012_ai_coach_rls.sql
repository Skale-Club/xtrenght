-- RLS for the AI coach.
--
-- This is the whole safety story for the feature. The chat route runs the model
-- against the signed-in user's client, so every tool call the model makes is
-- subject to these policies. A model that gets talked into reading someone
-- else's training data is refused by Postgres, not by a prompt.
--
-- The alternative -- a chat route holding the secret key -- would make every
-- policy in this database decorative for the one component most exposed to
-- untrusted input.

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_coach_notes enable row level security;

-- ------------------------------------------------------- ai_conversations --

create policy "conversations are readable by their owner"
  on public.ai_conversations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "conversations are insertable by their owner"
  on public.ai_conversations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "conversations are updatable by their owner"
  on public.ai_conversations for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "conversations are deletable by their owner"
  on public.ai_conversations for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------ ai_messages --

-- Ownership is inherited from the conversation; messages have no user_id of
-- their own. Same shape as workout_session_exercises.
create function public.owns_ai_conversation(conversation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.ai_conversations c
    where c.id = conversation_id
      and c.user_id = (select auth.uid())
  );
$$;

create policy "messages are readable by the conversation owner"
  on public.ai_messages for select
  to authenticated
  using (public.owns_ai_conversation(conversation_id));

create policy "messages are insertable by the conversation owner"
  on public.ai_messages for insert
  to authenticated
  with check (public.owns_ai_conversation(conversation_id));

create policy "messages are deletable by the conversation owner"
  on public.ai_messages for delete
  to authenticated
  using (public.owns_ai_conversation(conversation_id));

-- No update policy: a transcript is a record of what was said. Editing a past
-- turn would desynchronise it from what the model actually saw.

-- -------------------------------------------------------- ai_coach_notes --

create policy "coach notes are readable by their owner"
  on public.ai_coach_notes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "coach notes are insertable by their owner"
  on public.ai_coach_notes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "coach notes are updatable by their owner"
  on public.ai_coach_notes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Deletable by the owner on purpose: a note is a claim the model made about
-- you, and you get to retract it.
create policy "coach notes are deletable by their owner"
  on public.ai_coach_notes for delete
  to authenticated
  using ((select auth.uid()) = user_id);
