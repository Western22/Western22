-- =============================================================================
-- Bucket list: item details, fuzzy goal matching, buddies-only privacy,
-- goal facets for Explore (region, season, photo), stats, and goal pages.
-- The 200-goal seed is in the next migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Categories: two new ones. Labels live in the app's i18n messages.
-- ---------------------------------------------------------------------------
insert into public.goal_categories (slug, sort_order) values
  ('giving_back', 10), ('personal_growth', 11)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Goal facets.
--   region       continent-level area, null = can be done anywhere
--   best_months  calendar months (1-12) when the goal is best done locally;
--                null or empty = any time of year
--   photo_*      optional hero photo; must be https and carry a credit line
-- ---------------------------------------------------------------------------
alter table public.goals
  add column region text
    check (region in ('africa', 'asia', 'europe', 'middle_east', 'north_america',
                      'central_america_caribbean', 'south_america', 'oceania', 'antarctica')),
  add column best_months smallint[]
    check (best_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  add column photo_url text check (photo_url ~ '^https://'),
  add column photo_credit text check (char_length(photo_credit) <= 200),
  add constraint goals_photo_credited check (photo_url is null or photo_credit is not null);

create index goals_region_idx on public.goals (region) where status = 'active';
create index goals_months_gin on public.goals using gin (best_months);

-- ---------------------------------------------------------------------------
-- Follows. "Buddies" = two people who follow each other.
-- TODO(follows): follow/unfollow UI; blocks (from the design doc) should also
-- cut buddy access once that table exists.
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;
create policy "both sides can see a follow" on public.follows for select to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));
create policy "follow as yourself" on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy "unfollow as yourself" on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- SECURITY DEFINER so RLS policies can call it without seeing others' follows.
create or replace function public.are_buddies(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Only answers for pairs that include the caller, so it can't map other people's follows.
  select a is not null and b is not null and a <> b
     and auth.uid() in (a, b)
     and exists (select 1 from public.follows where follower_id = a and followee_id = b)
     and exists (select 1 from public.follows where follower_id = b and followee_id = a);
$$;
-- anon needs it too because the bucket_items policy calls it (it returns false without a user).
revoke execute on function public.are_buddies(uuid, uuid) from public;
grant execute on function public.are_buddies(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- bucket_items: details and three-level privacy.
-- ---------------------------------------------------------------------------
alter table public.bucket_items
  drop column category,  -- deprecated copy of the goal's category
  add column timeframe text not null default 'someday'
    check (timeframe in ('this_year', 'one_to_three_years', 'someday')),
  add column flexibility text not null default 'flexible'
    check (flexibility in ('fixed', 'flexible', 'very_flexible')),
  -- Rough budget in US dollars; null = not set.
  add column budget text
    check (budget in ('under_500', '500_2000', '2000_5000', 'over_5000'));

alter table public.bucket_items drop constraint bucket_items_visibility_check;
alter table public.bucket_items add constraint bucket_items_visibility_check
  check (visibility in ('public', 'buddies', 'private'));

drop policy "public items are readable by anyone; private by owner" on public.bucket_items;
create policy "items readable by audience" on public.bucket_items for select to anon, authenticated
  using (
    visibility = 'public'
    or owner_id = (select auth.uid())
    or (visibility = 'buddies' and (select public.are_buddies(owner_id, auth.uid())))
  );

grant update (timeframe, flexibility, budget) on public.bucket_items to authenticated;

-- Goal stats and trending read these.
create index bucket_items_goal_status_idx on public.bucket_items (goal_id, status);
create index bucket_items_goal_created_idx on public.bucket_items (goal_id, created_at desc);
drop index if exists public.bucket_items_goal_idx;

-- ---------------------------------------------------------------------------
-- Goal stats. Counts include every item, whatever its privacy: a count can't
-- identify anyone, and a private dream still means someone wants it.
-- ---------------------------------------------------------------------------
create or replace function public.goal_counts(p_goal_id uuid)
returns table (wanted_count bigint, done_count bigint, recent_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where status <> 'done'),
         count(*) filter (where status = 'done'),
         count(*) filter (where created_at > now() - interval '30 days')
  from public.bucket_items
  where goal_id = p_goal_id;
$$;
revoke execute on function public.goal_counts(uuid) from public;
grant execute on function public.goal_counts(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: add_bucket_item (v2) — the one way to add an item.
--   p_goal_id given  -> link to that goal (if visible to the caller)
--   p_goal_id null   -> 1. an alias that matches exactly (after normalizing)
--                       2. otherwise the closest alias by trigram similarity,
--                          if it clears FUZZY_THRESHOLD
--                       3. otherwise a new goal, pending moderation
-- Returns which path was taken so the UI can say "Linked to …".
-- ---------------------------------------------------------------------------
drop function public.add_bucket_item(text, uuid, text, text);

create or replace function public.add_bucket_item(
  p_title text,
  p_goal_id uuid default null,
  p_visibility text default 'public',
  p_locale text default 'en',
  p_timeframe text default 'someday',
  p_flexibility text default 'flexible',
  p_budget text default null
)
returns table (item_id uuid, goal_id uuid, match text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Tuned on the seed: "climb kilimanjaro" -> "Climb Mount Kilimanjaro" (0.74) and
  -- "see the northern lights in norway" (0.77) match; "eat pizza in rome" ->
  -- "Eat pizza in Naples" (0.52) and "learn spanish" -> "Learn Spanish in Oaxaca" (0.58) don't.
  fuzzy_threshold constant real := 0.6;
  uid uuid := auth.uid();
  clean_title text := trim(p_title);
  norm text;
  target_goal uuid := p_goal_id;
  how text := 'chosen';
  best_score real;
  new_item uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if clean_title is null or char_length(clean_title) not between 3 and 140 then
    raise exception 'invalid title' using errcode = '22023';
  end if;
  if p_visibility not in ('public', 'buddies', 'private')
     or p_timeframe not in ('this_year', 'one_to_three_years', 'someday')
     or p_flexibility not in ('fixed', 'flexible', 'very_flexible')
     or (p_budget is not null and p_budget not in ('under_500', '500_2000', '2000_5000', 'over_5000')) then
    raise exception 'invalid item details' using errcode = '22023';
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
    how := 'exact';

    if target_goal is null then
      -- `%` uses the trigram index (default threshold 0.3) to find candidates.
      select a.goal_id, extensions.similarity(a.normalized, norm) into target_goal, best_score
      from public.goal_aliases a
      join public.goals g on g.id = a.goal_id
      where a.normalized operator(extensions.%) norm
        and (g.status = 'active' or g.created_by = uid)
      order by extensions.similarity(a.normalized, norm) desc, (g.status = 'active') desc
      limit 1;
      if best_score is null or best_score < fuzzy_threshold then
        target_goal := null;
      else
        how := 'fuzzy';
      end if;
    end if;
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
    how := 'new';
  end if;

  -- The user's wording becomes an alias, improving future matches.
  insert into public.goal_aliases (goal_id, locale, alias, created_by)
  values (target_goal, p_locale, clean_title, uid)
  on conflict on constraint goal_aliases_goal_id_normalized_key do nothing;

  insert into public.bucket_items (owner_id, goal_id, title, visibility, locale, timeframe, flexibility, budget)
  values (uid, target_goal, clean_title, p_visibility, p_locale, p_timeframe, p_flexibility, p_budget)
  returning id into new_item;

  return query select new_item, target_goal, how;
exception
  when unique_violation then
    raise exception 'already on your list' using errcode = '23505';
end;
$$;

revoke execute on function public.add_bucket_item(text, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.add_bucket_item(text, uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: search_goals (v2) — adds the slug, and counts every item.
-- ---------------------------------------------------------------------------
drop function public.search_goals(text, text, int);

create or replace function public.search_goals(
  p_query text default '',
  p_locale text default 'en',
  p_limit int default 8
)
returns table (goal_id uuid, slug text, title text, category_slug text, wanted_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select public.normalize_goal_text(coalesce(p_query, '')) as norm),
  candidates as (
    select g.id, g.slug, g.category_slug, g.featured_rank,
           max(extensions.similarity(a.normalized, q.norm)) as score
    from public.goals g
    join public.goal_aliases a on a.goal_id = g.id
    cross join q
    where (g.status = 'active' or (g.status = 'pending' and g.created_by = auth.uid()))
      and (case when q.norm = '' then g.featured_rank is not null
                else a.normalized like '%' || q.norm || '%'
                     or extensions.similarity(a.normalized, q.norm) > 0.25 end)
    group by g.id, g.slug, g.category_slug, g.featured_rank
  )
  select c.id, c.slug,
         public.goal_title(c.id, p_locale),
         c.category_slug,
         (select count(*) from public.bucket_items b where b.goal_id = c.id and b.status <> 'done')
  from candidates c
  order by c.score desc, c.featured_rank nulls last
  limit least(greatest(p_limit, 1), 20);
$$;

grant execute on function public.search_goals(text, text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: explore_goals — browse active goals.
--   p_category / p_region  exact filters (null = all)
--   p_season               'dec_feb' | 'mar_may' | 'jun_aug' | 'sep_nov': goals whose
--                          best months overlap (goals good any time are left out)
--   p_sort                 'popular' | 'trending' (items added in the last 30 days)
--                          | 'near' (needs the caller's saved location; only goals
--                          with a place, within p_radius_km)
-- distance_km is rounded to 10 km. It is measured from the caller's own snapped
-- point, which is never returned.
-- ---------------------------------------------------------------------------
create or replace function public.explore_goals(
  p_locale text default 'en',
  p_category text default null,
  p_region text default null,
  p_season text default null,
  p_sort text default 'popular',
  p_limit int default 24,
  p_offset int default 0,
  p_radius_km int default 1500
)
returns table (
  goal_id uuid, slug text, title text, category_slug text, region text,
  place_name text, place_country text, photo_url text,
  wanted_count bigint, done_count bigint, recent_count bigint, distance_km int
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select l.location from public.profile_locations l where l.user_id = auth.uid()
  ),
  season as (
    select case p_season
      when 'dec_feb' then array[12,1,2]
      when 'mar_may' then array[3,4,5]
      when 'jun_aug' then array[6,7,8]
      when 'sep_nov' then array[9,10,11]
    end::smallint[] as months
  ),
  filtered as (
    select g.*,
           case when me.location is not null and g.place_location is not null
                then (round(extensions.st_distance(g.place_location, me.location) / 10000) * 10)::int
           end as distance
    from public.goals g
    cross join season
    left join me on true
    where g.status = 'active'
      and (p_category is null or g.category_slug = p_category)
      and (p_region is null or g.region = p_region)
      and (season.months is null or g.best_months && season.months)
      and (p_sort <> 'near'
           or (me.location is not null and g.place_location is not null
               and extensions.st_dwithin(g.place_location, me.location, least(greatest(p_radius_km, 10), 5000) * 1000.0)))
  )
  select f.id, f.slug, public.goal_title(f.id, p_locale), f.category_slug, f.region,
         f.place_name, f.place_country, f.photo_url,
         c.wanted_count, c.done_count, c.recent_count, f.distance
  from filtered f
  cross join lateral public.goal_counts(f.id) c
  order by
    case when p_sort = 'near' then f.distance end asc nulls last,
    case when p_sort = 'trending' then c.recent_count end desc nulls last,
    c.wanted_count + c.done_count desc,
    f.featured_rank asc nulls last,
    f.slug
  limit least(greatest(p_limit, 1), 48)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.explore_goals(text, text, text, text, text, int, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: goal_details — everything a goal page needs, by slug.
-- Visible: active and merged goals to everyone; pending/rejected only to their
-- creator and moderators (same rule as the goals RLS policy). A merged goal
-- returns merged_into_slug so the page can redirect.
-- ---------------------------------------------------------------------------
create or replace function public.goal_details(p_slug text, p_locale text default 'en')
returns table (
  goal_id uuid, slug text, status text, merged_into_slug text,
  title text, description text, category_slug text, region text,
  place_name text, place_country text, best_months smallint[],
  photo_url text, photo_credit text,
  wanted_count bigint, done_count bigint, my_item_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.slug, g.status, m.slug,
         public.goal_title(g.id, p_locale),
         (select t.description from public.goal_translations t
           where t.goal_id = g.id and t.description is not null
           order by case when t.locale = p_locale then 0
                         when t.locale = split_part(p_locale, '-', 1) then 1
                         when t.locale = g.default_locale then 2 else 3 end
           limit 1),
         g.category_slug, g.region, g.place_name, g.place_country, g.best_months,
         g.photo_url, g.photo_credit,
         c.wanted_count, c.done_count,
         (select b.id from public.bucket_items b where b.goal_id = g.id and b.owner_id = auth.uid())
  from public.goals g
  left join public.goals m on m.id = g.merged_into_id
  cross join lateral public.goal_counts(g.id) c
  where g.slug = p_slug
    and (g.status in ('active', 'merged') or g.created_by = auth.uid() or public.is_moderator());
$$;

grant execute on function public.goal_details(text, text) to anon, authenticated;

-- profile_stats now also counts buddies-only items when the viewer is a buddy (RLS applies).
create or replace function public.profile_stats(p_profile_id uuid)
returns table (completed_count bigint, active_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  -- SECURITY INVOKER: RLS on bucket_items limits this to rows the caller may see.
  select count(*) filter (where status = 'done'),
         count(*) filter (where status <> 'done')
  from public.bucket_items
  where owner_id = p_profile_id and visibility <> 'private';
$$;
