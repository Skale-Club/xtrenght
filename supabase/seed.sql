-- Seed data for local development (`supabase db reset` runs this).
--
-- The three exercises from workout-cool's data/sample-exercises.csv, pivoted
-- from its long form into one row each. Enough to render the catalogue; use
-- `pnpm db:import-exercises` for a real dataset.
--
-- Idempotent: legacy_id is unique, so re-running updates instead of duplicating.

insert into public.exercises (
  legacy_id, name, slug, description, introduction,
  full_video_url, full_video_image_url,
  exercise_types, primary_muscles, secondary_muscles, equipment, mechanics
) values
  (
    157,
    'Barbell Alternating Reverse Lunges',
    'barbell-alternating-reverse-lunges',
    '<p>Stand upright holding a barbell placed across the back of your shoulders.</p><p>Step back 2-3 feet with one foot and lower your body to the ground.</p><p>Your back knee should almost touch the ground and your front knee should be at a 90-degree angle.</p><p>Push up to return to the starting position.</p><p>Repeat with the other leg.</p><p>Repeat the movement for the recommended number of repetitions, then switch to the other leg.</p>',
    '<p>The <strong>barbell alternating reverse lunges</strong> are an effective exercise to target the <strong>leg muscles</strong> and <strong>glutes</strong>. Ideal for intermediate to advanced athletes, this exercise helps improve <em>balance</em> and <em>stability</em> while increasing <strong>leg strength</strong>.</p>',
    'https://www.youtube.com/embed/NmfQzqGktgs?autoplay=1',
    'https://img.youtube.com/vi/NmfQzqGktgs/hqdefault.jpg',
    '{STRENGTH}',
    '{QUADRICEPS}',
    '{GLUTES,HAMSTRINGS}',
    '{BARBELL,BAR}',
    'COMPOUND'
  ),
  (
    163,
    'Facepulls',
    'facepulls',
    '<p>Attach a rope to a low pulley cable machine.</p><p>Stand facing the machine and hold the rope with an overhand grip.</p><p>Step back to create tension in the cable, with feet shoulder-width apart.</p><p>Keep your back straight and lean slightly forward, bending your knees slightly.</p><p>Pull the rope towards your chest, squeezing your shoulder blades together.</p><p>Pause at the end of the movement, then slowly release and extend your arms back to the starting position.</p><p>Repeat for the desired number of repetitions.</p>',
    '<p>The <strong>Facepull</strong> or <em>Face Pull</em> is an excellent <em>isolation exercise</em> for strengthening the <strong>posterior shoulder muscles</strong> and the <strong>upper back</strong>. Highly valued for its effectiveness in preventing and combating postural imbalances, it is suitable for both beginners and advanced trainees.</p>',
    'https://www.youtube.com/embed/3ZViIERC1QQ?autoplay=1',
    'https://img.youtube.com/vi/3ZViIERC1QQ/hqdefault.jpg',
    '{STRENGTH}',
    '{SHOULDERS}',
    '{FOREARMS}',
    '{CABLE,ROPE}',
    'ISOLATION'
  ),
  (
    164,
    'Bench Hops',
    'bench-hops',
    '<p>Start with a box or bench in front of you. Stand with feet shoulder-width apart. This will be your starting position.</p><p> Perform a short squat in preparation for the jump.</p><p> Jump over the bench, landing with your knees bent, absorbing the impact through your legs.</p>',
    '<p><strong>Bench hops</strong> are an excellent way to <em>improve explosive power</em> and <em>agility</em>. By repeatedly hopping from side to side over a bench, you''ll work your <strong>quads, hamstrings, and calves</strong>. This intense movement is especially beneficial for athletes and those looking to boost their overall fitness.</p>',
    'https://www.youtube.com/embed/R3TCOHRwCl8?autoplay=1',
    'https://img.youtube.com/vi/R3TCOHRwCl8/hqdefault.jpg',
    '{PLYOMETRICS,CROSSFIT,CARDIO}',
    '{FULL_BODY}',
    '{}',
    '{BENCH}',
    'COMPOUND'
  )
on conflict (legacy_id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  introduction = excluded.introduction,
  full_video_url = excluded.full_video_url,
  full_video_image_url = excluded.full_video_image_url,
  exercise_types = excluded.exercise_types,
  primary_muscles = excluded.primary_muscles,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  mechanics = excluded.mechanics;
