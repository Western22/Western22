-- =============================================================================
-- 0003 · Onboarding fields, approximate home location, canonical goals, avatars
--
-- Implements the approved design (see "Buddies: PRD and data model"):
--   * Every bucket item links to a canonical goal (decision 1). A title that
--     matches no goal creates a 'pending' goal owned by its creator.
--   * Moderators are a small allowlist table (decision 3).
--   * Home location is stored snapped to a ~5 km grid, never the exact point.
--   * 18+ confirmation and onboarding completion can only be set through RPCs.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Moderators
-- ---------------------------------------------------------------------------
create table public.moderators (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.moderators enable row level security;
-- No policies: clients can't read or write it. Managed with SQL / service role.

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.moderators where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Profile fields collected during onboarding
-- ---------------------------------------------------------------------------

-- True when every element is a lowercase ISO 639 code (2 or 3 letters).
create or replace function public.valid_language_codes(codes text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(c ~ '^[a-z]{2,3}$'), true) from unnest(codes) as c;
$$;

alter table public.profiles
  add column languages     text[] not null default '{}'
    check (cardinality(languages) <= 12 and public.valid_language_codes(languages)),
  -- Keep this list in sync with INTERESTS in src/lib/onboarding.ts.
  add column interests     text[] not null default '{}'
    check (cardinality(interests) <= 24 and interests <@ array[
      'hiking','diving','surfing','climbing','skiing','running','cycling','wildlife',
      'photography','music','festivals','art','history','food','cooking','wine',
      'wellness','languages','volunteering','road_trips','camping','nightlife','dance','space'
    ]::text[]),
  add column travel_styles text[] not null default '{}'
    check (travel_styles <@ array['solo','budget','luxury','adventure']::text[]),
  -- Self-attested 18+ confirmation. Set only via confirm_adult().
  add column adult_confirmed_at timestamptz,
  -- Set only via complete_onboarding().
  add column onboarded_at timestamptz;

-- Clients may update only these profile columns; the timestamps above are RPC-only.
revoke update on public.profiles from authenticated;
grant update (username, display_name, bio, avatar_url, home_city, home_country, locale,
              languages, interests, travel_styles)
  on public.profiles to authenticated;

create or replace function public.confirm_adult()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.profiles
     set adult_confirmed_at = coalesce(adult_confirmed_at, now())
   where id = auth.uid();
end;
$$;

create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and adult_confirmed_at is not null) then
    raise exception 'age not confirmed' using errcode = '42501';
  end if;
  update public.profiles
     set onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid();
end;
$$;

revoke execute on function public.confirm_adult(), public.complete_onboarding() from public, anon;
grant execute on function public.confirm_adult(), public.complete_onboarding() to authenticated;

-- Magic-link signups pass {"adult_confirmed": true} in user metadata from the
-- age checkbox, so the confirmation is recorded the moment the account exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (id, display_name, locale, adult_confirmed_at)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name',
                              new.raw_user_meta_data ->> 'full_name')), 60), ''),
    case
      when requested_locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$' then requested_locale
      else 'en'
    end,
    case when (new.raw_user_meta_data ->> 'adult_confirmed') = 'true' then now() end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approximate home location: snap to a ~5 km grid before storing.
-- 0.045° of latitude ≈ 5 km; the longitude step widens toward the poles so
-- cells stay roughly 5 km wide everywhere.
-- ---------------------------------------------------------------------------
comment on table public.profile_locations is
  'Approximate home location, snapped to a ~5 km grid. Owner-only via RLS. Never return it to other users.';

create or replace function public.set_my_location(lat double precision, lng double precision)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  step_lat constant double precision := 0.045;
  snapped_lat double precision;
  step_lng double precision;
  snapped_lng double precision;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;

  snapped_lat := greatest(-90, least(90, round(lat / step_lat) * step_lat));
  step_lng := step_lat / greatest(cos(radians(snapped_lat)), 0.01);
  snapped_lng := round(lng / step_lng) * step_lng;
  -- Wrap into [-180, 180].
  snapped_lng := ((snapped_lng + 540)::numeric % 360 - 180)::double precision;

  insert into public.profile_locations (user_id, location)
  values (
    auth.uid(),
    extensions.st_setsrid(extensions.st_makepoint(snapped_lng, snapped_lat), 4326)::extensions.geography
  )
  on conflict (user_id) do update set location = excluded.location;
end;
$$;

-- ---------------------------------------------------------------------------
-- Canonical goals
-- ---------------------------------------------------------------------------
create table public.goal_categories (
  slug        text primary key check (slug ~ '^[a-z_]{2,30}$'),  -- UI label comes from i18n messages
  sort_order  smallint not null default 0
);
insert into public.goal_categories (slug, sort_order) values
  ('adventure', 1), ('travel', 2), ('learning', 3), ('creative', 4), ('sport', 5),
  ('food', 6), ('nature', 7), ('culture', 8), ('social', 9), ('other', 99);
alter table public.goal_categories enable row level security;
create policy "categories readable" on public.goal_categories
  for select to anon, authenticated using (true);

create table public.goals (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{3,90}$'),
  category_slug   text not null default 'other' references public.goal_categories (slug),
  default_locale  text not null default 'en',
  status          text not null default 'pending'
                  check (status in ('pending', 'active', 'merged', 'rejected')),
  merged_into_id  uuid references public.goals (id),
  -- Where the goal happens (a public place, e.g. Kilimanjaro), not a user location.
  place_name      text check (char_length(place_name) <= 120),
  place_country   text check (place_country ~ '^[A-Z]{2}$'),
  place_location  extensions.geography(point, 4326),
  -- Seeded goals are suggested during onboarding, in this order.
  featured_rank   smallint,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint goals_merge_consistent check ((status = 'merged') = (merged_into_id is not null)),
  constraint goals_not_self_merge check (merged_into_id <> id)
);
create index goals_category_idx on public.goals (category_slug) where status = 'active';
create index goals_featured_idx on public.goals (featured_rank) where featured_rank is not null;
create index goals_place_gix on public.goals using gist (place_location);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create table public.goal_translations (
  goal_id      uuid not null references public.goals (id) on delete cascade,
  locale       text not null check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  title        text not null check (char_length(title) between 3 and 140),
  description  text check (char_length(description) <= 2000),
  primary key (goal_id, locale)
);

create table public.goal_aliases (
  id          bigint generated always as identity primary key,
  goal_id     uuid not null references public.goals (id) on delete cascade,
  locale      text not null,
  alias       text not null check (char_length(alias) between 2 and 140),
  -- Lowercased, accents stripped; maintained by trigger and searched by trigram.
  normalized  text not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (goal_id, normalized)
);
create index goal_aliases_trgm_idx on public.goal_aliases using gin (normalized extensions.gin_trgm_ops);

-- Normalise text for matching: lowercase, no accents, single spaces.
create or replace function public.normalize_goal_text(input text)
returns text
language sql
stable
set search_path = ''
as $$
  select regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, trim(input))),
    '\s+', ' ', 'g');
$$;

create or replace function public.goal_aliases_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized := public.normalize_goal_text(new.alias);
  return new;
end;
$$;

create trigger goal_aliases_normalize
  before insert or update of alias on public.goal_aliases
  for each row execute function public.goal_aliases_normalize();

alter table public.goals enable row level security;
alter table public.goal_translations enable row level security;
alter table public.goal_aliases enable row level security;

-- Active goals are public; pending ones are visible to their creator and moderators.
create policy "goals readable" on public.goals for select to anon, authenticated
  using (status in ('active', 'merged') or created_by = (select auth.uid()) or (select public.is_moderator()));
create policy "moderators edit goals" on public.goals for update to authenticated
  using ((select public.is_moderator())) with check ((select public.is_moderator()));
-- Users create goals only through add_bucket_item() (SECURITY DEFINER), never directly.

create policy "translations follow goal visibility" on public.goal_translations
  for select to anon, authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id));
create policy "moderators manage translations" on public.goal_translations
  for all to authenticated
  using ((select public.is_moderator())) with check ((select public.is_moderator()));

-- Aliases are matching data only; they are never shown, so clients can't read them.
create policy "moderators manage aliases" on public.goal_aliases
  for all to authenticated
  using ((select public.is_moderator())) with check ((select public.is_moderator()));

-- Display title for a goal in a locale: exact locale, then its language, then the goal's default.
create or replace function public.goal_title(p_goal_id uuid, p_locale text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.title
  from public.goal_translations t
  join public.goals g on g.id = t.goal_id
  where t.goal_id = p_goal_id
  order by case
    when t.locale = p_locale then 0
    when t.locale = split_part(p_locale, '-', 1) then 1
    when t.locale = g.default_locale then 2
    else 3 end
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Seed: popular goals, suggested during onboarding.
-- ---------------------------------------------------------------------------
with seed (slug, category, rank, title, place, country) as (
  values
    ('see-the-northern-lights',        'nature',    1, 'See the Northern Lights',               null,                  null),
    ('climb-mount-kilimanjaro',        'adventure', 2, 'Climb Mount Kilimanjaro',               'Mount Kilimanjaro',   'TZ'),
    ('learn-tango-in-buenos-aires',    'learning',  3, 'Learn tango in Buenos Aires',           'Buenos Aires',        'AR'),
    ('go-skydiving',                   'adventure', 4, 'Go skydiving',                          null,                  null),
    ('dive-the-great-barrier-reef',    'nature',    5, 'Dive the Great Barrier Reef',           'Great Barrier Reef',  'AU'),
    ('hike-the-inca-trail',            'travel',    6, 'Hike the Inca Trail to Machu Picchu',   'Machu Picchu',        'PE'),
    ('run-a-marathon',                 'sport',     7, 'Run a marathon',                        null,                  null),
    ('learn-to-surf',                  'sport',     8, 'Learn to surf',                         null,                  null),
    ('see-cherry-blossoms-in-japan',   'culture',   9, 'See the cherry blossoms in Japan',      'Japan',               'JP'),
    ('hot-air-balloon-in-cappadocia',  'adventure', 10, 'Ride a hot air balloon in Cappadocia', 'Cappadocia',          'TR'),
    ('safari-in-the-serengeti',        'nature',    11, 'Go on safari in the Serengeti',        'Serengeti',           'TZ'),
    ('become-fluent-in-a-new-language','learning',  12, 'Become fluent in a new language',      null,                  null),
    ('drive-route-66',                 'travel',    13, 'Drive Route 66',                       'Route 66',            'US'),
    ('visit-antarctica',               'travel',    14, 'Visit Antarctica',                     'Antarctica',          'AQ'),
    ('celebrate-carnival-in-rio',      'culture',   15, 'Celebrate Carnival in Rio',            'Rio de Janeiro',      'BR'),
    ('cooking-class-in-italy',         'food',      16, 'Take a cooking class in Italy',        'Italy',               'IT'),
    ('swim-with-whale-sharks',         'nature',    17, 'Swim with whale sharks',               null,                  null),
    ('trek-to-everest-base-camp',      'adventure', 18, 'Trek to Everest Base Camp',            'Everest Base Camp',   'NP'),
    ('sleep-under-the-sahara-stars',   'nature',    19, 'Sleep under the stars in the Sahara',  'Sahara',              null),
    ('learn-to-play-guitar',           'creative',  20, 'Learn to play the guitar',             null,                  null)
), inserted as (
  insert into public.goals (slug, category_slug, status, featured_rank, place_name, place_country)
  select slug, category, 'active', rank, place, country from seed
  returning id, slug
)
insert into public.goal_translations (goal_id, locale, title)
select i.id, 'en', s.title from inserted i join seed s using (slug);

-- Every title is also an alias, plus a few other phrasings and languages.
insert into public.goal_aliases (goal_id, locale, alias)
select goal_id, locale, title from public.goal_translations;

insert into public.goal_aliases (goal_id, locale, alias)
select g.id, a.locale, a.alias
from (values
  ('see-the-northern-lights', 'en', 'See the aurora'),
  ('see-the-northern-lights', 'en', 'Aurora borealis'),
  ('see-the-northern-lights', 'es', 'Ver la aurora boreal'),
  ('see-the-northern-lights', 'fr', 'Voir les aurores boréales'),
  ('see-the-northern-lights', 'pt', 'Ver a aurora boreal'),
  ('climb-mount-kilimanjaro', 'en', 'Summit Kilimanjaro'),
  ('climb-mount-kilimanjaro', 'es', 'Escalar el Kilimanjaro'),
  ('learn-tango-in-buenos-aires', 'es', 'Aprender tango en Buenos Aires'),
  ('go-skydiving', 'en', 'Jump out of a plane'),
  ('go-skydiving', 'es', 'Saltar en paracaídas'),
  ('run-a-marathon', 'fr', 'Courir un marathon'),
  ('see-cherry-blossoms-in-japan', 'en', 'Hanami in Japan'),
  ('hike-the-inca-trail', 'en', 'Visit Machu Picchu')
) as a (slug, locale, alias)
join public.goals g on g.slug = a.slug;

-- ---------------------------------------------------------------------------
-- bucket_items: link every item to a goal.
-- ---------------------------------------------------------------------------
alter table public.bucket_items
  add column goal_id uuid references public.goals (id),
  add column locale text not null default 'en'
    check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$');

-- Backfill: each existing item gets its own pending goal (pre-launch data only).
do $$
declare
  item record;
  new_goal uuid;
begin
  for item in select id, owner_id, title, category, locale from public.bucket_items where goal_id is null loop
    insert into public.goals (slug, category_slug, status, created_by)
    values (
      left(trim(both '-' from regexp_replace(public.normalize_goal_text(item.title), '[^a-z0-9]+', '-', 'g')), 70)
        || '-' || left(replace(item.id::text, '-', ''), 8),
      item.category, 'pending', item.owner_id
    )
    returning id into new_goal;
    insert into public.goal_translations (goal_id, locale, title) values (new_goal, item.locale, item.title);
    insert into public.goal_aliases (goal_id, locale, alias, created_by) values (new_goal, item.locale, item.title, item.owner_id);
    update public.bucket_items set goal_id = new_goal where id = item.id;
  end loop;
end $$;

alter table public.bucket_items alter column goal_id set not null;
-- TODO(goals): drop bucket_items.category once the UI reads the goal's category everywhere.
comment on column public.bucket_items.category is 'Deprecated: copied from goals.category_slug. Will be dropped.';

create index bucket_items_goal_idx on public.bucket_items (goal_id) where visibility = 'public';
create unique index bucket_items_one_per_goal on public.bucket_items (owner_id, goal_id);

-- Items are now created only through add_bucket_item(), which picks or creates the goal.
drop policy "owner can create items" on public.bucket_items;
-- Owners may still change wording, visibility and status, but not the goal link or owner.
revoke update on public.bucket_items from authenticated;
grant update (title, description, visibility, status, place_name, place_country, target_date)
  on public.bucket_items to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: add_bucket_item — the one way to add an item.
--   p_goal_id given  -> link to that goal (if visible to the caller).
--   p_goal_id null   -> reuse a goal whose alias matches the title exactly,
--                       otherwise create a pending goal for the caller.
-- The user's own wording is saved as an alias to improve future matching.
-- ---------------------------------------------------------------------------
create or replace function public.add_bucket_item(
  p_title text,
  p_goal_id uuid default null,
  p_visibility text default 'public',
  p_locale text default 'en'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_title text := trim(p_title);
  norm text;
  target_goal uuid := p_goal_id;
  goal_category text;
  new_item uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if clean_title is null or char_length(clean_title) not between 3 and 140 then
    raise exception 'invalid title' using errcode = '22023';
  end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'invalid visibility' using errcode = '22023';
  end if;
  if p_locale !~ '^[a-z]{2,3}(-[A-Z]{2})?$' then
    p_locale := 'en';
  end if;
  norm := public.normalize_goal_text(clean_title);

  if target_goal is not null then
    -- Follow merges, and only allow goals the caller can see.
    select coalesce(g.merged_into_id, g.id) into target_goal
    from public.goals g
    where g.id = target_goal
      and (g.status in ('active', 'merged') or g.created_by = uid);
    if target_goal is null then
      raise exception 'goal not available' using errcode = '22023';
    end if;
  else
    select a.goal_id into target_goal
    from public.goal_aliases a
    join public.goals g on g.id = a.goal_id
    where a.normalized = norm and (g.status = 'active' or g.created_by = uid)
    order by (g.status = 'active') desc
    limit 1;
  end if;

  if target_goal is null then
    insert into public.goals (slug, status, default_locale, created_by)
    values (
      left(coalesce(nullif(trim(both '-' from regexp_replace(norm, '[^a-z0-9]+', '-', 'g')), ''), 'goal'), 70)
        || '-' || left(md5(gen_random_uuid()::text), 8),
      'pending', p_locale, uid
    )
    returning id into target_goal;
    insert into public.goal_translations (goal_id, locale, title) values (target_goal, p_locale, clean_title);
  end if;

  insert into public.goal_aliases (goal_id, locale, alias, created_by)
  values (target_goal, p_locale, clean_title, uid)
  on conflict (goal_id, normalized) do nothing;

  select category_slug into goal_category from public.goals where id = target_goal;

  insert into public.bucket_items (owner_id, goal_id, title, category, visibility, locale)
  values (uid, target_goal, clean_title, goal_category, p_visibility, p_locale)
  returning id into new_item;

  return new_item;
exception
  when unique_violation then
    raise exception 'already on your list' using errcode = '23505';
end;
$$;

revoke execute on function public.add_bucket_item(text, uuid, text, text) from public, anon;
grant execute on function public.add_bucket_item(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: search_goals — suggestions while typing; featured goals when empty.
-- Returns active goals (and the caller's own pending ones) with how many
-- people publicly want each.
-- ---------------------------------------------------------------------------
create or replace function public.search_goals(
  p_query text default '',
  p_locale text default 'en',
  p_limit int default 8
)
returns table (goal_id uuid, title text, category_slug text, wanted_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select public.normalize_goal_text(coalesce(p_query, '')) as norm),
  candidates as (
    select g.id, g.category_slug, g.featured_rank,
           max(extensions.similarity(a.normalized, q.norm)) as score
    from public.goals g
    join public.goal_aliases a on a.goal_id = g.id
    cross join q
    where (g.status = 'active' or (g.status = 'pending' and g.created_by = auth.uid()))
      and (q.norm = ''
           or a.normalized like '%' || q.norm || '%'
           or extensions.similarity(a.normalized, q.norm) > 0.25)
    group by g.id, g.category_slug, g.featured_rank
  )
  select c.id,
         public.goal_title(c.id, p_locale),
         c.category_slug,
         (select count(*) from public.bucket_items b where b.goal_id = c.id and b.visibility = 'public')
  from candidates c
  order by c.score desc, c.featured_rank nulls last
  limit least(greatest(p_limit, 1), 20);
$$;

grant execute on function public.search_goals(text, text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Avatars bucket. Public read (avatars are public profile data); each user
-- writes only inside their own folder: avatars/{user_id}/...
-- Images are resized and re-encoded client-side, which strips EXIF/GPS.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatar owner reads own folder" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar owner uploads to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar owner updates own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar owner deletes own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Public profile stats: completed goals count (public items only).
-- ---------------------------------------------------------------------------
create or replace function public.profile_stats(p_profile_id uuid)
returns table (completed_count bigint, active_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  -- SECURITY INVOKER: RLS on bucket_items already limits this to rows the caller may see.
  select count(*) filter (where status = 'done'),
         count(*) filter (where status <> 'done')
  from public.bucket_items
  where owner_id = p_profile_id and visibility = 'public';
$$;

grant execute on function public.profile_stats(uuid) to anon, authenticated;
