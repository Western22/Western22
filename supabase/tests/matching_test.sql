-- =============================================================================
-- Matching smoke test: find_matches, match requests and blocks. Runs inside one
-- transaction and rolls back. Run against a local database only:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/matching_test.sql
-- Success prints "ALL MATCHING CHECKS PASSED".
-- =============================================================================
begin;

-- People (all 18+ confirmed through signup metadata):
--   a  Ama    Accra    en,es  solo,adventure   the one searching
--   b  Bea    Kumasi   es,fr  adventure        ~200 km away, same plans
--   c  Chidi  London   en,es  solo,adventure   far away, different plans
--   d  Dee    Accra    private item            must not appear
--   e  Eli    Accra    blocks Ama              must not appear (either way)
--   f  Fay    Accra    never onboarded         must not appear
--   g  Gus    Accra    already did it          must not appear
--   h  Hal    Accra    buddies-only item       appears only once buddies
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || k)::uuid, k || '@example.com',
       jsonb_build_object('display_name', n, 'adult_confirmed', true)
from (values ('a1','Ama'),('b1','Bea'),('c1','Chidi'),('d1','Dee'),('e1','Eli'),('f1','Fay'),('71','Gus'),('81','Hal')) v(k, n);

update public.profiles p set
  username = lower(p.display_name),
  onboarded_at = case when p.display_name = 'Fay' then null else now() end,
  languages = case p.display_name when 'Ama' then '{en,es}' when 'Bea' then '{es,fr}' when 'Chidi' then '{en,es}' else '{en}' end::text[],
  travel_styles = case p.display_name when 'Ama' then '{solo,adventure}' when 'Bea' then '{adventure}'
                                      when 'Chidi' then '{solo,adventure}' else '{}' end::text[]
where p.id::text like '00000000-0000-0000-0000-0000000000%';

-- Locations, already on the ~5 km grid the app stores.
insert into public.profile_locations (user_id, location)
select p.id, case p.display_name
  when 'Bea' then 'SRID=4326;POINT(-1.62 6.705)'      -- Kumasi
  when 'Chidi' then 'SRID=4326;POINT(-0.135 51.525)'  -- London
  else 'SRID=4326;POINT(-0.18 5.595)' end::extensions.geography  -- Accra
from public.profiles p where p.id::text like '00000000-0000-0000-0000-0000000000%';

-- Everyone wants to learn the piano (no fixed place); Ama, Bea and Chidi also want Kilimanjaro (Tanzania).
insert into public.bucket_items (owner_id, title, goal_id, visibility, status, completed_at, timeframe, flexibility, budget)
select p.id, 'Learn the piano', (select id from public.goals where slug = 'learn-to-play-the-piano'),
       case p.display_name when 'Dee' then 'private' when 'Hal' then 'buddies' else 'public' end,
       case when p.display_name = 'Gus' then 'done' else 'dreaming' end,
       case when p.display_name = 'Gus' then now() end,
       case p.display_name when 'Chidi' then 'someday' else 'this_year' end,
       'flexible',
       case p.display_name when 'Chidi' then 'over_5000' else 'under_500' end
from public.profiles p where p.id::text like '00000000-0000-0000-0000-0000000000%';

insert into public.bucket_items (owner_id, title, goal_id, timeframe)
select p.id, 'Kilimanjaro', (select id from public.goals where slug = 'climb-mount-kilimanjaro'), 'one_to_three_years'
from public.profiles p where p.display_name in ('Ama', 'Bea', 'Chidi');

insert into public.blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

-- ---------- Ama looks for piano buddies ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare
  piano uuid := (select id from public.bucket_items where owner_id = auth.uid() and title = 'Learn the piano');
  kili uuid := (select id from public.bucket_items where owner_id = auth.uid() and title = 'Kilimanjaro');
  names text[];
  bea record;
begin
  select array_agg(username order by score desc) into names from public.find_matches(piano);
  assert names = '{bea,chidi}', 'only bea and chidi match, bea first; got ' || coalesce(names::text, 'none');

  select * into bea from public.find_matches(piano) where username = 'bea';
  assert bea.timeframe_score = 1 and bea.budget_score = 1, 'same timeframe and budget score 1';
  assert bea.shared_languages = '{es}', 'shared language is Spanish';
  assert bea.shared_styles = '{adventure}', 'shared travel style';
  assert bea.distance_km between 150 and 250 and bea.distance_km % 10 = 0, 'Kumasi is ~200 km, rounded: ' || bea.distance_km;
  assert not bea.is_worldwide, 'piano is not a worldwide goal';
  assert bea.active_within = 'week', 'recently active';
  assert bea.score between 0 and 100, 'score is 0..100';

  -- Weights come from the caller's config: with only language weight, chidi (en+es) beats bea (es).
  assert (select username from public.find_matches(piano,
            '{"weights":{"timeframe":0,"distance":0,"languages":1,"travelStyle":0,"budget":0,"recency":0}}') limit 1) = 'chidi',
         'weights are tunable';
  begin
    perform public.find_matches(piano, '{"weights":{"timeframe":-1}}');
    raise exception 'negative weight accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Kilimanjaro is far from Accra, so it's worldwide and far-away people still score well on distance.
  assert (select bool_and(is_worldwide) from public.find_matches(kili)), 'kilimanjaro is worldwide from Accra';
  assert (select min(distance_score) from public.find_matches(kili)) >= 0.5, 'worldwide distance floor';

  -- No coordinates in the result.
  assert not exists (
    select 1 from information_schema.routines r
    join information_schema.parameters prm on prm.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'find_matches' and prm.parameter_mode = 'OUT'
      and prm.data_type in ('USER-DEFINED') ), 'find_matches returns no geography columns';

  -- Someone else's item can't be used to search.
  begin
    perform public.find_matches((select id from public.bucket_items where title = 'Learn the piano'
                                 and owner_id = '00000000-0000-0000-0000-0000000000b1'));
    raise exception 'searched with someone else''s item';
  exception when invalid_parameter_value then null;
  end;

  -- Private, blocked and buddies-only items can't be requested.
  begin
    perform public.send_match_request(piano, (select id from public.bucket_items
                                              where owner_id = '00000000-0000-0000-0000-0000000000d1'));
    raise exception 'requested a private item';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.send_match_request(piano, (select id from public.bucket_items
                                              where owner_id = '00000000-0000-0000-0000-0000000000e1'));
    raise exception 'requested someone who blocked me';
  exception when invalid_parameter_value then null;
  end;

  -- Ama asks Bea, with a note. Asking twice fails.
  perform public.send_match_request(piano, bea.their_item_id, '  Practice together on Saturdays?  ');
  assert (select note from public.match_requests) = 'Practice together on Saturdays?', 'note trimmed';
  assert (select request_direction || request_status from public.find_matches(piano) where username = 'bea') = 'sentpending',
         'match card shows the sent request';
  begin
    perform public.send_match_request(piano, bea.their_item_id);
    raise exception 'duplicate request allowed';
  exception when unique_violation then null;
  end;
  begin
    perform public.send_match_request(piano, bea.their_item_id, repeat('x', 281));
    raise exception 'long note accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Ama also asks Chidi about Kilimanjaro.
  perform public.send_match_request(kili, (select their_item_id from public.find_matches(kili) where username = 'chidi'));
  -- Ama can't answer her own request.
  begin
    perform public.respond_match_request((select id from public.match_requests where recipient_id = '00000000-0000-0000-0000-0000000000b1'), true);
    raise exception 'sender answered own request';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.match_requests (goal_id, sender_id, recipient_id)
    values ((select goal_id from public.bucket_items where id = piano), auth.uid(), '00000000-0000-0000-0000-0000000000c1');
    raise exception 'direct insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Bea's inbox ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

do $$
declare req record;
begin
  assert (select count(*) from public.match_requests) = 1, 'bea sees only her request';
  select * into req from public.my_match_requests('en');
  assert req.direction = 'received' and req.other_username = 'ama' and req.goal_slug = 'learn-to-play-the-piano', 'inbox row';
  -- Bea can't send the reverse request; she should accept instead.
  begin
    perform public.send_match_request(
      (select id from public.bucket_items where owner_id = auth.uid() and title = 'Learn the piano'),
      (select id from public.bucket_items where owner_id = '00000000-0000-0000-0000-0000000000a1' and title = 'Learn the piano'));
    raise exception 'reverse request allowed';
  exception when unique_violation then
    declare h text;
    begin
      get stacked diagnostics h = pg_exception_hint;
      assert h = 'reverse', 'reverse hint returned, got ' || coalesce(h, 'null');
    end;
  end;
  perform public.respond_match_request(req.id, true);
  assert public.are_buddies(auth.uid(), '00000000-0000-0000-0000-0000000000a1'), 'accepting makes them buddies';
  assert (select status from public.my_match_requests('en')) = 'accepted', 'request accepted';
  begin
    perform public.respond_match_request(req.id, false);
    raise exception 'answered twice';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---------- Chidi declines, then Ama blocks Chidi ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$ begin
  perform public.respond_match_request((select id from public.my_match_requests('en')), false);
  assert (select status from public.match_requests) = 'declined', 'declined';
end $$;

-- Hal's buddies-only item shows up for Ama only once they follow each other.
reset role;
insert into public.follows (follower_id, followee_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-0000000000a1');
-- A pending request from Hal to Ama, to check blocking cancels it.
insert into public.match_requests (goal_id, sender_id, recipient_id)
values ((select id from public.goals where slug = 'learn-to-play-the-piano'),
        '00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare piano uuid := (select id from public.bucket_items where owner_id = auth.uid() and title = 'Learn the piano');
begin
  assert exists (select 1 from public.find_matches(piano) where username = 'hal'), 'buddies-only item visible to a buddy';
  assert (select request_direction from public.find_matches(piano) where username = 'hal') = 'received', 'received request shown';

  perform public.block_user('00000000-0000-0000-0000-000000000081');
  assert not exists (select 1 from public.find_matches(piano) where username = 'hal'), 'blocked user disappears';
  assert not exists (select 1 from public.my_match_requests('en') where other_username = 'hal'), 'blocked user leaves the inbox';
  assert (select status from public.match_requests where sender_id = '00000000-0000-0000-0000-000000000081') = 'cancelled',
         'blocking cancels pending requests';
  assert (select count(*) from public.follows where '00000000-0000-0000-0000-000000000081' in (follower_id, followee_id)) = 0,
         'blocking removes follows';
  assert (select count(*) from public.blocks) = 1, 'ama sees her own block only (not eli''s block of her)';

  perform public.unblock_user('00000000-0000-0000-0000-000000000081');
  assert (select count(*) from public.blocks) = 0, 'unblocked';

  begin
    perform public.is_blocked_between(auth.uid(), '00000000-0000-0000-0000-0000000000e1');
    raise exception 'is_blocked_between is callable';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-0000000000c1');
    raise exception 'direct block insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- After the unblock, Hal can ask again although his old request was cancelled ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated"}', true);
do $$ begin
  perform public.send_match_request(
    (select id from public.bucket_items where owner_id = auth.uid()),
    (select id from public.bucket_items where owner_id = '00000000-0000-0000-0000-0000000000a1' and title = 'Learn the piano'));
  assert (select count(*) from public.match_requests where status = 'pending') = 1, 'fresh request after unblock';
end $$;

-- ---------- Eli (who blocked Ama) doesn't see Ama either ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
do $$ begin
  assert not exists (
    select 1 from public.find_matches((select id from public.bucket_items where owner_id = auth.uid()))
    where username = 'ama'), 'blocker does not see the blocked person';
end $$;

-- ---------- Rate limit ----------
reset role;
insert into public.match_requests (goal_id, sender_id, recipient_id, created_at)
select g.id, '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', now()
from public.goals g where g.status = 'active' and g.slug not in ('learn-to-play-the-piano') limit 20;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$ begin
  perform public.send_match_request(
    (select id from public.bucket_items where owner_id = auth.uid() and title = 'Learn the piano'),
    (select id from public.bucket_items where owner_id = '00000000-0000-0000-0000-0000000000b1' and title = 'Learn the piano'));
  raise exception 'rate limit not enforced';
exception when program_limit_exceeded then null;
end $$;

-- ---------- Signed out ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin
    perform public.find_matches(gen_random_uuid());
    raise exception 'anon could call find_matches';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.match_requests;
    raise exception 'anon could read match_requests';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'ALL MATCHING CHECKS PASSED' as result;
rollback;
