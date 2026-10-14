-- =============================================================================
-- Matching: blocks, "Let's do this together" requests, and find_matches(),
-- which ranks other people who share a canonical goal.
-- Weights and tuning values come from the app (src/lib/matching/config.ts) as
-- jsonb; the defaults below only apply if a key is missing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Blocks. Either direction hides people from each other in matching and
-- requests, and ends buddy status.
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
-- Writes go through block_user / unblock_user; signed-out visitors get nothing.
revoke all on public.blocks from anon;
revoke insert, update, delete on public.blocks from authenticated;
-- Only the blocker sees their blocks; the blocked person is never told.
create policy "blocker sees own blocks" on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
-- Writes go through block_user() / unblock_user().

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

-- Buddies also requires that neither has blocked the other.
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
     and exists (select 1 from public.follows where follower_id = b and followee_id = a)
     and not public.is_blocked_between(a, b);
$$;

-- ---------------------------------------------------------------------------
-- "Let's do this together" requests. Created and answered only through RPCs.
-- ---------------------------------------------------------------------------
create table public.match_requests (
  id                uuid primary key default gen_random_uuid(),
  goal_id           uuid not null references public.goals (id) on delete cascade,
  sender_id         uuid not null references public.profiles (id) on delete cascade,
  recipient_id      uuid not null references public.profiles (id) on delete cascade,
  sender_item_id    uuid references public.bucket_items (id) on delete set null,
  recipient_item_id uuid references public.bucket_items (id) on delete set null,
  note              text check (char_length(note) <= 280),
  status            text not null default 'pending'
                    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at        timestamptz not null default now(),
  responded_at      timestamptz,
  constraint match_requests_not_self check (sender_id <> recipient_id),
  constraint match_requests_responded check ((status = 'pending') = (responded_at is null))
);
-- One request per direction per goal; re-sending after a decline isn't allowed.
create unique index match_requests_one_per_pair on public.match_requests (goal_id, sender_id, recipient_id);
create index match_requests_recipient_idx on public.match_requests (recipient_id, status, created_at desc);
create index match_requests_sender_idx on public.match_requests (sender_id, created_at desc);

alter table public.match_requests enable row level security;
-- Writes go through send_match_request / respond_match_request / block_user.
revoke all on public.match_requests from anon;
revoke insert, update, delete on public.match_requests from authenticated;
create policy "both sides see a request" on public.match_requests for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

-- ---------------------------------------------------------------------------
-- block_user / unblock_user
-- Blocking also cancels pending requests and removes follows both ways.
-- ---------------------------------------------------------------------------
create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_user_id is null or p_user_id = uid then raise exception 'invalid user' using errcode = '22023'; end if;

  insert into public.blocks (blocker_id, blocked_id) values (uid, p_user_id) on conflict do nothing;
  delete from public.follows
   where (follower_id = uid and followee_id = p_user_id) or (follower_id = p_user_id and followee_id = uid);
  update public.match_requests set status = 'cancelled', responded_at = now()
   where status = 'pending'
     and ((sender_id = uid and recipient_id = p_user_id) or (sender_id = p_user_id and recipient_id = uid));
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
$$;

revoke execute on function public.block_user(uuid) from public, anon;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Who may be matched with a given item: the item is not private (buddies-only
-- items need a buddy), its owner finished onboarding, it's not done, and
-- neither person blocked the other.
-- ---------------------------------------------------------------------------
create or replace function public.item_matchable_by(p_item public.bucket_items, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_item.owner_id <> p_viewer
     and p_item.status <> 'done'
     and (p_item.visibility = 'public'
          or (p_item.visibility = 'buddies'
              and exists (select 1 from public.follows where follower_id = p_item.owner_id and followee_id = p_viewer)
              and exists (select 1 from public.follows where follower_id = p_viewer and followee_id = p_item.owner_id)))
     and exists (select 1 from public.profiles p
                 where p.id = p_item.owner_id and p.onboarded_at is not null and p.adult_confirmed_at is not null)
     and not public.is_blocked_between(p_item.owner_id, p_viewer);
$$;
revoke execute on function public.item_matchable_by(public.bucket_items, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- find_matches: rank people who share the canonical goal of one of the
-- caller's items. Every component scores 0..1; the total is the weighted
-- average, 0..100.
--
--   timeframe    same = 1, neighbouring = 0.5, otherwise 0.2; +0.2 if either
--                is very flexible
--   distance     local goals: 1 / (1 + km / distance_half_km) between homes.
--                "Worldwide" goals (a fixed place farther than worldwide_km
--                from the caller): 0.5 + half of that, since people meet there
--   languages    shared languages, 2 or more = 1
--   travel_style overlap of travel styles (shared / combined)
--   budget       same tier = 1, neighbouring = 0.5, unknown = 0.3
--   recency      0.5 ^ (days since last active / recency_half_life_days)
--
-- Privacy: returns only public profile fields; distance is rounded
-- (see round_distance_km) and coordinates never leave the database.
-- ---------------------------------------------------------------------------
create or replace function public.round_distance_km(km double precision)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when km is null then null
    when km < 25 then 25        -- shown as "under 25 km"
    when km < 200 then (round(km / 10) * 10)::int
    when km < 1000 then (round(km / 50) * 50)::int
    else (round(km / 100) * 100)::int
  end;
$$;

create or replace function public.find_matches(
  p_item_id uuid,
  p_config jsonb default '{}'::jsonb,
  p_limit int default 30
)
returns table (
  profile_id uuid, username text, display_name text, avatar_url text,
  home_city text, home_country text,
  their_item_id uuid, their_timeframe text, their_budget text,
  score int,
  timeframe_score real, distance_score real, language_score real,
  style_score real, budget_score real, recency_score real,
  distance_km int, is_worldwide boolean,
  shared_languages text[], shared_styles text[],
  active_within text,
  request_id uuid, request_status text, request_direction text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mine public.bucket_items;
  my_goal uuid;
  goal_place extensions.geography;
  my_loc extensions.geography;
  my_profile public.profiles;
  worldwide boolean := false;
  -- Tunable values (see src/lib/matching/config.ts).
  w_timeframe real := coalesce((p_config #>> '{weights,timeframe}')::real, 25);
  w_distance  real := coalesce((p_config #>> '{weights,distance}')::real, 20);
  w_languages real := coalesce((p_config #>> '{weights,languages}')::real, 20);
  w_style     real := coalesce((p_config #>> '{weights,travelStyle}')::real, 10);
  w_budget    real := coalesce((p_config #>> '{weights,budget}')::real, 15);
  w_recency   real := coalesce((p_config #>> '{weights,recency}')::real, 10);
  half_km     real := greatest(coalesce((p_config ->> 'distanceHalfKm')::real, 100), 1);
  worldwide_km real := coalesce((p_config ->> 'worldwideKm')::real, 300);
  half_life   real := greatest(coalesce((p_config ->> 'recencyHalfLifeDays')::real, 30), 1);
  w_total     real;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if least(w_timeframe, w_distance, w_languages, w_style, w_budget, w_recency) < 0 then
    raise exception 'weights must not be negative' using errcode = '22023';
  end if;
  w_total := w_timeframe + w_distance + w_languages + w_style + w_budget + w_recency;
  if w_total <= 0 then
    raise exception 'weights must not all be zero' using errcode = '22023';
  end if;

  select * into mine from public.bucket_items b where b.id = p_item_id and b.owner_id = uid;
  if mine.id is null then
    raise exception 'item not found' using errcode = '22023';
  end if;

  select coalesce(g.merged_into_id, g.id) into my_goal from public.goals g where g.id = mine.goal_id;
  select g.place_location into goal_place from public.goals g where g.id = my_goal;
  select l.location into my_loc from public.profile_locations l where l.user_id = uid;
  select * into my_profile from public.profiles p where p.id = uid;

  -- A goal tied to a far-away place: people come from everywhere.
  worldwide := goal_place is not null
               and (my_loc is null or extensions.st_distance(goal_place, my_loc) > worldwide_km * 1000);

  return query
  with candidates as (
    select b.id as item_id, b.owner_id, b.timeframe, b.flexibility, b.budget, b.updated_at as item_updated
    from public.bucket_items b
    join public.goals g on g.id = b.goal_id
    where coalesce(g.merged_into_id, g.id) = my_goal
      and public.item_matchable_by(b, uid)
  ),
  scored as (
    select c.*, p.username, p.display_name, p.avatar_url, p.home_city, p.home_country,
           p.languages, p.travel_styles,
           extensions.st_distance(l.location, my_loc) / 1000.0 as km,
           array(select unnest(p.languages) intersect select unnest(my_profile.languages) order by 1) as langs,
           array(select unnest(p.travel_styles) intersect select unnest(my_profile.travel_styles) order by 1) as styles,
           cardinality(array(select unnest(p.travel_styles) union select unnest(my_profile.travel_styles))) as style_union,
           extract(epoch from now() - greatest(c.item_updated, p.updated_at, u.last_sign_in_at)) / 86400.0 as idle_days
    from candidates c
    join public.profiles p on p.id = c.owner_id
    left join public.profile_locations l on l.user_id = c.owner_id
    left join auth.users u on u.id = c.owner_id
  ),
  components as (
    select s.*,
      least(1, (case
        when s.timeframe = mine.timeframe then 1
        when (s.timeframe, mine.timeframe) in (('this_year', 'one_to_three_years'), ('one_to_three_years', 'this_year'),
                                               ('one_to_three_years', 'someday'), ('someday', 'one_to_three_years')) then 0.5
        else 0.2 end)
        + case when 'very_flexible' in (s.flexibility, mine.flexibility) then 0.2 else 0 end)::real as tf,
      (case
        when worldwide then 0.5 + 0.5 * coalesce(1 / (1 + s.km / half_km), 0)
        else coalesce(1 / (1 + s.km / half_km), 0) end)::real as dist,
      least(cardinality(s.langs) / 2.0, 1)::real as lang,
      (case when s.style_union = 0 then 0 else cardinality(s.styles)::real / s.style_union end)::real as style,
      (case
        when s.budget is null or mine.budget is null then 0.3
        else greatest(0, 1 - 0.5 * abs(array_position(array['under_500','500_2000','2000_5000','over_5000'], s.budget)
                                      - array_position(array['under_500','500_2000','2000_5000','over_5000'], mine.budget)))
        end)::real as bud,
      power(0.5, greatest(coalesce(s.idle_days, 365), 0) / half_life)::real as rec
    from scored s
  )
  select c.owner_id, c.username, c.display_name, c.avatar_url, c.home_city, c.home_country,
         c.item_id, c.timeframe, c.budget,
         round(100 * (w_timeframe * c.tf + w_distance * c.dist + w_languages * c.lang
                      + w_style * c.style + w_budget * c.bud + w_recency * c.rec) / w_total)::int,
         c.tf, c.dist, c.lang, c.style, c.bud, c.rec,
         public.round_distance_km(c.km), worldwide,
         c.langs, c.styles,
         case when c.idle_days < 7 then 'week' when c.idle_days < 30 then 'month' else 'older' end,
         r.id, r.status,
         case when r.id is null then null when r.sender_id = uid then 'sent' else 'received' end
  from components c
  left join lateral (
    select m.id, m.status, m.sender_id from public.match_requests m
    where m.goal_id = my_goal
      and ((m.sender_id = uid and m.recipient_id = c.owner_id) or (m.sender_id = c.owner_id and m.recipient_id = uid))
    order by m.created_at desc limit 1
  ) r on true
  order by 10 desc, c.idle_days asc nulls last
  limit least(greatest(p_limit, 1), 50);
end;
$$;

revoke execute on function public.find_matches(uuid, jsonb, int) from public, anon;
grant execute on function public.find_matches(uuid, jsonb, int) to authenticated;

-- ---------------------------------------------------------------------------
-- send_match_request: from one of the caller's items to someone they can
-- match with on the same goal. Limited to 20 a day to curb spam.
-- If the other person already asked, the caller should accept instead.
-- ---------------------------------------------------------------------------
create or replace function public.send_match_request(p_my_item_id uuid, p_their_item_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mine public.bucket_items;
  theirs public.bucket_items;
  my_goal uuid;
  their_goal uuid;
  clean_note text := nullif(trim(p_note), '');
  new_id uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if char_length(clean_note) > 280 then raise exception 'note too long' using errcode = '22023'; end if;

  select * into mine from public.bucket_items where id = p_my_item_id and owner_id = uid;
  select * into theirs from public.bucket_items where id = p_their_item_id;
  if mine.id is null or theirs.id is null or not public.item_matchable_by(theirs, uid) then
    raise exception 'not available' using errcode = '22023';
  end if;
  select coalesce(merged_into_id, id) into my_goal from public.goals where id = mine.goal_id;
  select coalesce(merged_into_id, id) into their_goal from public.goals where id = theirs.goal_id;
  if my_goal <> their_goal then raise exception 'not the same goal' using errcode = '22023'; end if;

  if exists (select 1 from public.match_requests
             where goal_id = my_goal and sender_id = theirs.owner_id and recipient_id = uid and status = 'pending') then
    raise exception 'they already asked you' using errcode = '23505', hint = 'reverse';
  end if;
  if (select count(*) from public.match_requests where sender_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many requests today' using errcode = '54000';
  end if;

  -- A request cancelled by a block (since lifted) shouldn't stop a fresh one.
  delete from public.match_requests
   where goal_id = my_goal and sender_id = uid and recipient_id = theirs.owner_id and status = 'cancelled';

  -- Inner block so only the insert's duplicate error is translated (not the 'reverse' one above).
  begin
    insert into public.match_requests (goal_id, sender_id, recipient_id, sender_item_id, recipient_item_id, note)
    values (my_goal, uid, theirs.owner_id, mine.id, theirs.id, clean_note)
    returning id into new_id;
  exception
    when unique_violation then
      raise exception 'already asked' using errcode = '23505';
  end;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- respond_match_request: the recipient accepts or declines a pending request.
-- Accepting makes the two people buddies (mutual follows).
-- The requests page then offers to start a group for the goal (see 0007).
-- ---------------------------------------------------------------------------
create or replace function public.respond_match_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  req public.match_requests;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into req from public.match_requests
   where id = p_request_id and recipient_id = uid and status = 'pending'
   for update;
  if req.id is null then raise exception 'request not found' using errcode = '22023'; end if;
  if public.is_blocked_between(req.sender_id, uid) then raise exception 'request not found' using errcode = '22023'; end if;

  update public.match_requests
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = req.id;

  if p_accept then
    insert into public.follows (follower_id, followee_id) values (uid, req.sender_id), (req.sender_id, uid)
    on conflict do nothing;
  end if;
end;
$$;

revoke execute on function public.send_match_request(uuid, uuid, text) from public, anon;
revoke execute on function public.respond_match_request(uuid, boolean) from public, anon;
grant execute on function public.send_match_request(uuid, uuid, text) to authenticated;
grant execute on function public.respond_match_request(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- my_match_requests: the caller's inbox and outbox with display data.
-- ---------------------------------------------------------------------------
create or replace function public.my_match_requests(p_locale text default 'en')
returns table (
  id uuid, direction text, status text, note text, created_at timestamptz,
  goal_slug text, goal_title text,
  other_id uuid, other_username text, other_display_name text, other_avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         case when m.sender_id = auth.uid() then 'sent' else 'received' end,
         m.status, m.note, m.created_at,
         g.slug, public.goal_title(g.id, p_locale),
         p.id, p.username, p.display_name, p.avatar_url
  from public.match_requests m
  join public.goals g on g.id = m.goal_id
  join public.profiles p on p.id = case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end
  where auth.uid() in (m.sender_id, m.recipient_id)
    and m.status <> 'cancelled'
    and not public.is_blocked_between(m.sender_id, m.recipient_id)
  order by (m.status = 'pending' and m.recipient_id = auth.uid()) desc, m.created_at desc
  limit 200;
$$;
revoke execute on function public.my_match_requests(text) from public, anon;
grant execute on function public.my_match_requests(text) to authenticated;
