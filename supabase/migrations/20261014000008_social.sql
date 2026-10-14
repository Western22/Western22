-- =============================================================================
-- 0008 · Social layer: follows that respect blocks, richer stories (photos,
-- city-level place, tagged group members), reactions, comments, "add to my
-- bucket list" from a story, an explainable home feed and badges.
-- =============================================================================

-- Whether the caller and someone else are blocked either way. Policies use
-- this instead of is_blocked_between so nobody can probe other pairs.
create or replace function public.blocked_with_me(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and public.is_blocked_between(p_other, auth.uid());
$$;
grant execute on function public.blocked_with_me(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Follows: you can't follow someone you've blocked or who blocked you.
-- ---------------------------------------------------------------------------
drop policy "follow as yourself" on public.follows;
create policy "follow as yourself" on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()) and not public.blocked_with_me(followee_id));

-- Follower / following counts for a public profile (counts only, never lists).
create or replace function public.follow_counts(p_profile_id uuid)
returns table (followers int, following int, i_follow boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::int from public.follows where followee_id = p_profile_id),
         (select count(*)::int from public.follows where follower_id = p_profile_id),
         exists (select 1 from public.follows where follower_id = auth.uid() and followee_id = p_profile_id);
$$;
grant execute on function public.follow_counts(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stories: up to 4 photos (replacing the single photo_url from 0007), a
-- city-level place label, and tags for fellow group members.
-- ---------------------------------------------------------------------------
alter table public.stories
  add column photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 4),
  -- Typed label such as "Moshi, Tanzania". Never coordinates.
  add column place text check (char_length(place) <= 100);
update public.stories set photo_urls = array[photo_url] where photo_url is not null;
drop policy "authors post stories" on public.stories;
alter table public.stories drop column photo_url;

-- Every photo must be a public URL inside the author's own folder in the stories bucket.
create or replace function public.story_photos_valid(p_urls text[], p_author uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(u like '%/storage/v1/object/public/stories/' || p_author::text || '/%'
                           and char_length(u) <= 2048), true)
  from unnest(p_urls) u;
$$;

-- Stories are written through create_story(); hide stories between blocked people.
revoke insert on public.stories from authenticated;
drop policy "stories are public" on public.stories;
create policy "stories are public" on public.stories for select to anon, authenticated
  using (not public.blocked_with_me(author_id));

create table public.story_tags (
  story_id  uuid not null references public.stories (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  primary key (story_id, user_id)
);
create index story_tags_user_idx on public.story_tags (user_id);
alter table public.story_tags enable row level security;
revoke insert, update on public.story_tags from anon, authenticated;
revoke delete on public.story_tags from anon;
create policy "tags are public" on public.story_tags for select to anon, authenticated using (true);
-- Anyone tagged can remove their own tag.
create policy "untag yourself" on public.story_tags for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Reactions and comments
-- ---------------------------------------------------------------------------
create table public.story_reactions (
  story_id    uuid not null references public.stories (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('love', 'fire', 'inspired', 'congrats')),
  created_at  timestamptz not null default now(),
  primary key (story_id, user_id, kind)
);
create index story_reactions_story_idx on public.story_reactions (story_id);
alter table public.story_reactions enable row level security;
revoke update on public.story_reactions from anon, authenticated;
revoke insert, delete on public.story_reactions from anon;
create policy "reactions are public" on public.story_reactions for select to anon, authenticated using (true);
create policy "react as yourself" on public.story_reactions for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.stories s where s.id = story_id
                          and not public.blocked_with_me(s.author_id)));
create policy "remove own reactions" on public.story_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.story_comments (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references public.stories (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index story_comments_story_idx on public.story_comments (story_id, created_at);
alter table public.story_comments enable row level security;
revoke update on public.story_comments from anon, authenticated;
revoke insert, delete on public.story_comments from anon;
-- TODO(moderation): reporting comments, like chat messages.
create policy "comments are public" on public.story_comments for select to anon, authenticated
  using (not public.blocked_with_me(author_id));
create policy "comment as yourself" on public.story_comments for insert to authenticated
  with check (author_id = (select auth.uid())
              and exists (select 1 from public.stories s where s.id = story_id
                          and not public.blocked_with_me(s.author_id))
              -- A light brake on spam: 30 comments an hour.
              and (select count(*) from public.story_comments c
                   where c.author_id = (select auth.uid()) and c.created_at > now() - interval '1 hour') < 30);
create policy "author or story owner deletes comments" on public.story_comments for delete to authenticated
  using (author_id = (select auth.uid())
         or exists (select 1 from public.stories s where s.id = story_id and s.author_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- "Add to my bucket list" from a story: remember which story inspired the
-- item, so stories can show how many people they inspired.
-- ---------------------------------------------------------------------------
alter table public.bucket_items
  add column source_story_id uuid references public.stories (id) on delete set null;
create index bucket_items_source_story_idx on public.bucket_items (source_story_id) where source_story_id is not null;

create or replace function public.add_goal_from_story(p_story_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_onboarded();
  st public.stories;
  goal uuid;
  loc text;
  new_id uuid;
begin
  select * into st from public.stories where id = p_story_id;
  if st.id is null or public.is_blocked_between(st.author_id, uid) then
    raise exception 'story not found' using errcode = '22023';
  end if;
  select coalesce(merged_into_id, id) into goal from public.goals where id = st.goal_id and status in ('active', 'merged');
  if goal is null then raise exception 'story not found' using errcode = '22023'; end if;
  if exists (select 1 from public.bucket_items b join public.goals g on g.id = b.goal_id
             where b.owner_id = uid and coalesce(g.merged_into_id, g.id) = goal) then
    raise exception 'already on your list' using errcode = '23505';
  end if;
  select locale into loc from public.profiles where id = uid;
  insert into public.bucket_items (owner_id, title, goal_id, locale, source_story_id)
  values (uid, public.goal_title(goal, coalesce(loc, 'en')), goal, coalesce(loc, 'en'), st.id)
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_story: text, up to 4 photos, a place label, an optional group (you
-- must be in it) and tags (only fellow members of that group).
-- ---------------------------------------------------------------------------
create or replace function public.create_story(
  p_goal_id uuid,
  p_body text,
  p_group_id uuid default null,
  p_place text default null,
  p_photo_urls text[] default '{}',
  p_tagged uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_onboarded();
  goal uuid;
  new_id uuid;
begin
  select coalesce(merged_into_id, id) into goal from public.goals where id = p_goal_id and status in ('active', 'merged');
  if goal is null then raise exception 'goal not found' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then raise exception 'invalid story' using errcode = '22023'; end if;
  if not public.story_photos_valid(coalesce(p_photo_urls, '{}'), uid) or cardinality(coalesce(p_photo_urls, '{}')) > 4 then
    raise exception 'invalid photos' using errcode = '22023';
  end if;
  if p_group_id is not null and not public.group_has_member(p_group_id, uid) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_tagged, '{}')) > 0 and (
       p_group_id is null
       or exists (select 1 from unnest(p_tagged) t(u) where t.u = uid or not public.group_has_member(p_group_id, t.u))
     ) then
    raise exception 'can only tag fellow group members' using errcode = '22023';
  end if;
  if (select count(*) from public.stories where author_id = uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many stories today' using errcode = '54000';
  end if;

  insert into public.stories (author_id, goal_id, group_id, body, place, photo_urls)
  values (uid, goal, p_group_id, trim(p_body), nullif(trim(p_place), ''), coalesce(p_photo_urls, '{}'))
  returning id into new_id;
  insert into public.story_tags (story_id, user_id)
  select new_id, t.u from (select distinct unnest(coalesce(p_tagged, '{}')) as u) t;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- story_cards: everything a story card shows, for a list of story ids.
-- ---------------------------------------------------------------------------
create or replace function public.story_cards(p_ids uuid[], p_locale text default 'en')
returns table (
  id uuid, body text, place text, photo_urls text[], created_at timestamptz,
  author_id uuid, author_username text, author_display_name text, author_avatar_url text,
  goal_id uuid, goal_slug text, goal_title text,
  group_id uuid, group_name text,
  tagged jsonb,
  reactions jsonb, my_reactions text[],
  comment_count int, inspired_count int, on_my_list boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.body, s.place, s.photo_urls, s.created_at,
         p.id, p.username, p.display_name, p.avatar_url,
         g.id, g.slug, public.goal_title(g.id, p_locale),
         grp.id, grp.name,
         coalesce((select jsonb_agg(jsonb_build_object('username', tp.username, 'name', coalesce(tp.display_name, tp.username)))
                   from public.story_tags tg join public.profiles tp on tp.id = tg.user_id where tg.story_id = s.id), '[]'::jsonb),
         coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from public.story_reactions r
                   where r.story_id = s.id group by kind) k), '{}'::jsonb),
         array(select kind from public.story_reactions r where r.story_id = s.id and r.user_id = auth.uid()),
         (select count(*)::int from public.story_comments c where c.story_id = s.id
           and (auth.uid() is null or not public.is_blocked_between(c.author_id, auth.uid()))),
         (select count(*)::int from public.bucket_items b where b.source_story_id = s.id),
         exists (select 1 from public.bucket_items b join public.goals bg on bg.id = b.goal_id
                 where b.owner_id = auth.uid() and coalesce(bg.merged_into_id, bg.id) = s.goal_id)
  from unnest(p_ids) with ordinality as ids(id, ord)
  join public.stories s on s.id = ids.id
  join public.profiles p on p.id = s.author_id
  join public.goals g on g.id = s.goal_id
  left join public.groups grp on grp.id = s.group_id
  where auth.uid() is null or not public.is_blocked_between(s.author_id, auth.uid())
  order by ids.ord;
$$;
grant execute on function public.story_cards(uuid[], text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- home_feed: a simple, explainable ranking. Every row says why it's there.
--
-- Stories (last window_days, not your own):
--   score = (follow_weight if you follow the author
--            + group_weight if it was posted in one of your groups
--            + on_list_weight if the goal is on your list
--            + min(reactions x reaction_weight, reaction_cap))
--           x 0.5 ^ (age in hours / half_life_hours)
--   Only stories with at least one of the first three reasons are shown.
-- New groups for goals on your list (open, not full, last window_days):
--   score = new_group_weight x 0.5 ^ (age in hours / half_life_hours)
-- Trending goals not on your list (most added in 30 days):
--   score = trending_weight / rank
--
-- Weights come from src/lib/feed/config.ts; these are the defaults.
-- ---------------------------------------------------------------------------
create or replace function public.home_feed(p_config jsonb default '{}'::jsonb, p_limit int default 30)
returns table (
  kind text,            -- story | new_group | trending_goal
  score real,
  reason text,          -- follow | group | on_list | new_group | trending
  reason_label text,    -- the followed person's name, the group's name, or the goal's title
  story_id uuid,
  group_id uuid,
  goal_id uuid,
  trending_count int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  w_follow    real := coalesce((p_config #>> '{weights,follow}')::real, 3);
  w_group     real := coalesce((p_config #>> '{weights,group}')::real, 3);
  w_on_list   real := coalesce((p_config #>> '{weights,onList}')::real, 1);
  w_reaction  real := coalesce((p_config #>> '{weights,reaction}')::real, 0.2);
  reaction_cap real := coalesce((p_config ->> 'reactionCap')::real, 2);
  w_new_group real := coalesce((p_config #>> '{weights,newGroup}')::real, 2);
  w_trending  real := coalesce((p_config #>> '{weights,trending}')::real, 1.5);
  half_life   real := greatest(coalesce((p_config ->> 'halfLifeHours')::real, 48), 1);
  window_days int  := least(greatest(coalesce((p_config ->> 'windowDays')::int, 30), 1), 90);
  max_groups  int  := coalesce((p_config ->> 'maxNewGroups')::int, 5);
  max_trending int := coalesce((p_config ->> 'maxTrending')::int, 3);
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  return query
  with my_goals as (
    select distinct coalesce(g.merged_into_id, g.id) as goal_id
    from public.bucket_items b join public.goals g on g.id = b.goal_id
    where b.owner_id = uid
  ),
  my_groups as (select m.group_id from public.group_members m where m.user_id = uid),
  followees as (select f.followee_id from public.follows f where f.follower_id = uid),
  story_rows as (
    select s.id, s.group_id, s.goal_id, s.created_at,
           s.author_id in (select followee_id from followees) as by_followee,
           s.group_id is not null and s.group_id in (select group_id from my_groups) as in_my_group,
           s.goal_id in (select goal_id from my_goals) as on_list,
           (select count(*) from public.story_reactions r where r.story_id = s.id) as reactions
    from public.stories s
    where s.created_at > now() - make_interval(days => window_days)
      and s.author_id <> uid
      and not public.is_blocked_between(s.author_id, uid)
  ),
  stories_scored as (
    select 'story'::text,
           ((case when sr.by_followee then w_follow else 0 end
             + case when sr.in_my_group then w_group else 0 end
             + case when sr.on_list then w_on_list else 0 end
             + least(sr.reactions * w_reaction, reaction_cap))
            * power(0.5, extract(epoch from now() - sr.created_at) / 3600.0 / half_life))::real,
           case when sr.in_my_group then 'group' when sr.by_followee then 'follow' else 'on_list' end,
           case when sr.in_my_group then (select name from public.groups where id = sr.group_id)
                when sr.by_followee then (select coalesce(p.display_name, p.username) from public.profiles p
                                          join public.stories s2 on s2.author_id = p.id where s2.id = sr.id)
                else public.goal_title(sr.goal_id, coalesce((select locale from public.profiles where id = uid), 'en')) end,
           sr.id, sr.group_id, sr.goal_id, null::int
    from story_rows sr
    where sr.by_followee or sr.in_my_group or sr.on_list
  ),
  new_groups as (
    select 'new_group'::text,
           (w_new_group * power(0.5, extract(epoch from now() - g.created_at) / 3600.0 / half_life))::real,
           'new_group'::text,
           public.goal_title(g.goal_id, coalesce((select locale from public.profiles where id = uid), 'en')),
           null::uuid, g.id, g.goal_id, null::int
    from public.groups g
    where g.goal_id in (select goal_id from my_goals)
      and g.created_at > now() - make_interval(days => window_days)
      and g.status <> 'completed'
      and g.member_count < g.max_size
      and g.id not in (select group_id from my_groups)
      and not public.is_blocked_between(g.owner_id, uid)
    order by g.created_at desc
    limit max_groups
  ),
  trending as (
    select t.goal_id, t.n, row_number() over (order by t.n desc, t.goal_id) as rnk
    from (
      select coalesce(g.merged_into_id, g.id) as goal_id, count(*)::int as n
      from public.bucket_items b join public.goals g on g.id = b.goal_id
      where b.created_at > now() - interval '30 days' and g.status in ('active', 'merged')
      group by 1
    ) t
    join public.goals tg on tg.id = t.goal_id and tg.status = 'active'
    where t.goal_id not in (select goal_id from my_goals)
    order by t.n desc
    limit max_trending
  ),
  trending_scored as (
    select 'trending_goal'::text, (w_trending / t.rnk)::real, 'trending'::text,
           public.goal_title(t.goal_id, coalesce((select locale from public.profiles where id = uid), 'en')),
           null::uuid, null::uuid, t.goal_id, t.n
    from trending t
  )
  select * from (
    select * from stories_scored
    union all select * from new_groups
    union all select * from trending_scored
  ) items
  order by 2 desc
  limit least(greatest(p_limit, 1), 60);
end;
$$;
revoke execute on function public.home_feed(jsonb, int) from public, anon;
grant execute on function public.home_feed(jsonb, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Badges. Computed from data (so they're always true) using only non-private
-- items; user_badges remembers which ones the owner has already been shown,
-- so each milestone is celebrated once.
-- ---------------------------------------------------------------------------
create or replace function public.badges_for(p_profile_id uuid)
returns table (badge text)
language sql
stable
security definer
set search_path = ''
as $$
  with items as (
    select b.status, coalesce(g.merged_into_id, g.id) as goal_id
    from public.bucket_items b join public.goals g on g.id = b.goal_id
    where b.owner_id = p_profile_id and b.visibility <> 'private'
  ),
  stats as (
    select
      (select count(*) from items) as item_count,
      (select count(*) from items where status = 'done') as done_count,
      (select count(distinct g.place_country) from items i join public.goals g on g.id = i.goal_id
        where i.status = 'done' and g.place_country is not null) as countries,
      (select count(*) from public.group_members where user_id = p_profile_id) as groups,
      (select count(*) from public.group_members m join public.groups g on g.id = m.group_id
        where m.user_id = p_profile_id and g.status = 'completed') as completed_groups,
      (select count(*) from public.stories where author_id = p_profile_id) as stories,
      (select cardinality(languages) from public.profiles where id = p_profile_id) as languages
  )
  select b.badge from stats, lateral (values
    ('first_dream', item_count >= 1),
    ('big_dreamer', item_count >= 10),
    ('doer', done_count >= 1),
    ('unstoppable', done_count >= 5),
    ('first_group', groups >= 1),
    ('team_player', completed_groups >= 1),
    ('storyteller', stories >= 1),
    ('globetrotter', countries >= 5),
    ('polyglot', languages >= 3)
  ) as b(badge, earned)
  where b.earned;
$$;
grant execute on function public.badges_for(uuid) to anon, authenticated;

create table public.user_badges (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge      text not null,
  seen_at    timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table public.user_badges enable row level security;
revoke all on public.user_badges from anon;
revoke insert, update, delete on public.user_badges from authenticated;
create policy "own badge history" on public.user_badges for select to authenticated using (user_id = (select auth.uid()));

-- Badges the caller has earned but not yet been shown.
create or replace function public.new_badges()
returns table (badge text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.badge from public.badges_for(auth.uid()) b
  where auth.uid() is not null
    and not exists (select 1 from public.user_badges u where u.user_id = auth.uid() and u.badge = b.badge);
$$;

create or replace function public.mark_badges_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.user_badges (user_id, badge)
  select auth.uid(), b.badge from public.badges_for(auth.uid()) b
  where auth.uid() is not null
  on conflict do nothing;
$$;

revoke execute on function public.add_goal_from_story(uuid) from public, anon;
revoke execute on function public.create_story(uuid, text, uuid, text, text[], uuid[]) from public, anon;
revoke execute on function public.new_badges() from public, anon;
revoke execute on function public.mark_badges_seen() from public, anon;
grant execute on function public.add_goal_from_story(uuid) to authenticated;
grant execute on function public.create_story(uuid, text, uuid, text, text[], uuid[]) to authenticated;
grant execute on function public.new_badges() to authenticated;
grant execute on function public.mark_badges_seen() to authenticated;
