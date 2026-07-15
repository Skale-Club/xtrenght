-- Storage bucket for exercise demonstration images.
--
-- The catalogue first landed with image_urls pointing at raw.githubusercontent.com.
-- That hotlinks a third party: no uptime guarantee, rate limits on raw content,
-- and the images vanish if that repo moves. Owning the bytes removes all three.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-images',
  'exercise-images',
  -- Public: the catalogue is browsable signed-out, so these are served straight
  -- from the CDN with no token. Nothing here is user data.
  true,
  5242880, -- 5 MB; the largest source image is well under 100 KB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A public bucket serves /object/public/... without a policy, but listing and
-- direct object reads still go through RLS on storage.objects.
create policy "exercise images are readable by anyone"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'exercise-images');

-- Uploads run from scripts/upload-exercise-images.mts with the secret key, which
-- bypasses RLS. Admins get a path that does not require handing that key out.
create policy "exercise images are writable by admins"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'exercise-images' and public.is_admin());

create policy "exercise images are updatable by admins"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'exercise-images' and public.is_admin())
  with check (bucket_id = 'exercise-images' and public.is_admin());

create policy "exercise images are deletable by admins"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'exercise-images' and public.is_admin());
