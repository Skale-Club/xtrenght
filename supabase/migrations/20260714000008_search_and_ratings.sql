-- Two loose ends: an unindexable search, and a rating column nothing could set.

-- --------------------------------------------------------------- search --
--
-- The catalogue search is ilike '%term%'. A leading wildcard makes a btree
-- index useless, so every keystroke in the exercise picker was a seq scan over
-- 876 rows. Trigram indexes are built for exactly this shape.
create extension if not exists pg_trgm with schema extensions;

create index exercises_name_trgm_idx
  on public.exercises
  using gin (name extensions.gin_trgm_ops);

-- -------------------------------------------------------------- ratings --
--
-- workout_sessions.rating and rating_comment shipped in migration 4 and nothing
-- ever wrote to them: no policy forbade it, but no screen offered it either.
-- The UI now does, so the constraint below is what keeps the value meaningful.
--
-- rating already had a 1-5 check. A comment without a rating is orphaned text,
-- so tie them together.
alter table public.workout_sessions
  add constraint workout_sessions_comment_needs_rating
  check (rating_comment is null or rating is not null);

-- Finished sessions are what the history and rating screens read.
create index workout_sessions_finished_idx
  on public.workout_sessions (user_id, ended_at desc)
  where ended_at is not null;

-- ------------------------------------------------------- exercise history --
--
-- Serves "my heaviest bench" and the per-exercise history: given an exercise,
-- find this user's completed weighted sets. Without it that lookup scans every
-- set the user has ever logged.
--
-- Partial: an incomplete or bodyweight set is never a personal record.
create index workout_sets_pr_lookup_idx
  on public.workout_sets (workout_session_exercise_id, weight desc)
  where completed and weight is not null;
