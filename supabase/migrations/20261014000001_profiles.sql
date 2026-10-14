-- =============================================================================
-- 0001 · Profiles + private location
--
-- Privacy model:
--   * public.profiles holds ONLY fields that are safe for anyone to read
--     (username, display name, bio, avatar, a coarse home city/country label).
--     Email and phone stay in auth.users and are never copied here.
--   * public.profile_locations holds the user's exact point (PostGIS). Only the
--     owner can read or write it. Future matching ("people near me") must go
--     through SECURITY DEFINER functions that return coarse distances, never
--     coordinates.
--   * All timestamps are timestamptz (stored in UTC).
-- =============================================================================

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every UPDATE.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, publicly readable.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  -- Chosen during onboarding; null until then. Lowercase handle, unique.
  username      text unique
                check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name  text check (char_length(display_name) between 1 and 60),
  bio           text check (char_length(bio) <= 500),
  avatar_url    text check (char_length(avatar_url) <= 2048),
  -- Coarse, user-entered label only (e.g. "Accra"). Never derived from GPS.
  home_city     text check (char_length(home_city) <= 100),
  -- ISO 3166-1 alpha-2, uppercase (e.g. "GH").
  home_country  text check (home_country ~ '^[A-Z]{2}$'),
  -- BCP 47 tag of the UI language the user prefers (e.g. "en", "pt-BR").
  locale        text not null default 'en'
                check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile. Never store email, phone or exact location here.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Anyone (including signed-out visitors) can read public profile fields.
create policy "profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- Normally the signup trigger creates the row; this allows a self-heal insert.
create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No delete policy: profiles go away when the auth user is deleted (cascade).

-- ---------------------------------------------------------------------------
-- profile_locations: exact location, owner-only.
-- ---------------------------------------------------------------------------
create table public.profile_locations (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  location    extensions.geography(point, 4326) not null,
  updated_at  timestamptz not null default now()
);

comment on table public.profile_locations is
  'Exact user location. Owner-only via RLS. Never return coordinates of other users.';

-- Spatial index for future radius matching.
create index profile_locations_location_gix
  on public.profile_locations using gist (location);

create trigger profile_locations_set_updated_at
  before update on public.profile_locations
  for each row execute function public.set_updated_at();

alter table public.profile_locations enable row level security;

-- Signed-out visitors get no access at all.
revoke all on public.profile_locations from anon;

create policy "owner can read own location"
  on public.profile_locations for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "owner can insert own location"
  on public.profile_locations for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "owner can update own location"
  on public.profile_locations for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "owner can delete own location"
  on public.profile_locations for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- RPC: set_my_location(lat, lng)
-- Lets the client save a point without building WKT. SECURITY INVOKER, so the
-- RLS policies above still apply; it can only ever write the caller's row.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_location(lat double precision, lng double precision)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;

  insert into public.profile_locations (user_id, location)
  values (
    auth.uid(),
    extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
  )
  on conflict (user_id) do update
    set location = excluded.location;
end;
$$;

revoke execute on function public.set_my_location(double precision, double precision) from public, anon;
grant execute on function public.set_my_location(double precision, double precision) to authenticated;

-- RPC: has_my_location() — lets the UI show "location saved" without ever
-- sending the coordinates back to the browser.
create or replace function public.has_my_location()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.profile_locations where user_id = auth.uid());
$$;

revoke execute on function public.has_my_location() from public, anon;
grant execute on function public.has_my_location() to authenticated;

-- ---------------------------------------------------------------------------
-- Create a profile automatically when a user signs up.
-- SECURITY DEFINER because auth.users inserts run as the auth service role.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    -- Optional display name passed at signup; trimmed and length-capped.
    nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 60), ''),
    case
      when requested_locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$' then requested_locale
      else 'en'
    end
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
