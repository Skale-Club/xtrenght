-- Runtime configuration, editable from /admin instead of a redeploy.
--
-- Holds the AI coach's model, prompt overrides, and the OpenRouter key.
--
-- The Supabase keys themselves stay in the environment and cannot move here --
-- you need database access to read this table, so a key that unlocks the
-- database cannot live inside it.

create table public.app_settings (
  key text primary key,
  value text not null,

  -- Secrets are never returned to any client, not even an admin's browser.
  -- The admin UI shows "set / not set" and a last-updated stamp; to change one
  -- you overwrite it, you do not read it back.
  is_secret boolean not null default false,

  description text,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

-- No policies at all. Deliberate: with RLS on and nothing granted, PostgREST
-- returns nothing to anon and authenticated alike, so `value` cannot be read
-- over the API by anyone -- including an admin, including a compromised
-- session, including a model that has been talked into trying.
--
-- Reads happen two ways, both below: admins get metadata through
-- admin_list_settings() (which never returns a secret's value), and the server
-- reads the value with the service key, which bypasses RLS by design.

-- ------------------------------------------------------------ admin reads --

-- Metadata only. A secret's `value` is replaced by whether it is set, so this
-- is safe to call from a browser.
create function public.admin_list_settings()
returns table (
  key text,
  value text,
  is_secret boolean,
  is_set boolean,
  description text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.key,
    case when s.is_secret then null else s.value end as value,
    s.is_secret,
    length(trim(s.value)) > 0 as is_set,
    s.description,
    s.updated_at
  from public.app_settings s
  where public.is_admin()
  order by s.key;
$$;

-- ----------------------------------------------------------- admin writes --

-- Definer, because the table has no policies -- so the admin check has to live
-- here, and it is the only thing standing between any signed-in user and the
-- ability to repoint the coach at their own API key.
create function public.admin_set_setting(
  setting_key text,
  setting_value text,
  setting_is_secret boolean default false,
  setting_description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if setting_key is null or length(trim(setting_key)) = 0 then
    raise exception 'setting key is required' using errcode = '22023';
  end if;

  insert into public.app_settings (key, value, is_secret, description, updated_by)
  values (
    setting_key,
    setting_value,
    setting_is_secret,
    setting_description,
    (select auth.uid())
  )
  on conflict (key) do update set
    value = excluded.value,
    is_secret = excluded.is_secret,
    description = coalesce(excluded.description, public.app_settings.description),
    updated_by = excluded.updated_by;
end;
$$;

create function public.admin_delete_setting(setting_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.app_settings where key = setting_key;
end;
$$;

-- --------------------------------------------------------------- defaults --

insert into public.app_settings (key, value, is_secret, description) values
  ('openrouter_api_key', '', true, 'OpenRouter API key. Get one at https://openrouter.ai/keys.'),
  ('coach_model', 'anthropic/claude-opus-4.8', false, 'OpenRouter model slug for the AI coach.'),
  ('coach_effort', 'high', false, 'Reasoning effort: low, medium, high, xhigh, max.'),
  ('coach_system_prompt', '', false, 'Overrides the built-in coach prompt. Leave blank to use the default.')
on conflict (key) do nothing;
