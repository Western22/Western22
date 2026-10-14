-- =============================================================================
-- RLS and RPC smoke test. Runs inside one transaction and rolls back, so it
-- leaves no data behind. Run against a local database only:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Every check raises an exception on failure; success prints "ALL RLS CHECKS PASSED".
-- =============================================================================
begin;

-- Two users, created the way Supabase Auth would (fires the profile trigger).
-- Alice ticked the 18+ box on the magic-link form; Bob signed in with OAuth.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name":"Alice","locale":"pt-BR","adult_confirmed":true}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"full_name":"Bob B","locale":"not a locale"}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'signup trigger should create profiles';
  assert (select locale from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'pt-BR', 'valid locale kept';
  assert (select locale from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'en', 'invalid locale falls back to en';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Bob B', 'OAuth full_name used';
  assert (select adult_confirmed_at is not null from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'magic-link age confirmation recorded';
  assert (select adult_confirmed_at is null from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'OAuth user not yet confirmed';
end $$;

-- ---------- Act as Alice ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

update public.profiles
   set username = 'alice', bio = 'hi', languages = '{en,pt}', interests = '{hiking,food}', travel_styles = '{solo,adventure}'
 where id = '00000000-0000-0000-0000-00000000000a';
select public.set_my_location(5.6037, -0.1870);  -- Accra
select public.complete_onboarding();

-- Matches the seeded goal (case and spacing differ), a different language alias, and a brand-new idea.
select public.add_bucket_item('  see the NORTHERN lights ', null, 'public', 'en');
select public.add_bucket_item('Escalar el Kilimanjaro', null, 'public', 'es');
select public.add_bucket_item('Secret dream of mine', null, 'private', 'en');

do $$
declare
  n int;
  lat double precision;
  lng double precision;
begin
  assert (select onboarded_at is not null from public.profiles where id = auth.uid()), 'onboarding completed';
  assert public.has_my_location(), 'alice sees her own location flag';

  -- Stored location is snapped to the ~5 km grid, not the exact point.
  select extensions.st_y(location::extensions.geometry), extensions.st_x(location::extensions.geometry)
    into lat, lng from public.profile_locations where user_id = auth.uid();
  assert abs(lat - 5.6037) > 0.0001 or abs(lng + 0.1870) > 0.0001, 'location must not be stored exactly';
  assert abs(lat - 5.6037) < 0.03 and abs(lng + 0.1870) < 0.03, 'snapped point stays within ~5 km';
  assert abs(lat / 0.045 - round(lat / 0.045)) < 1e-9, 'latitude is on the 0.045 grid';

  assert (select count(*) from public.bucket_items) = 3, 'alice sees all her items';
  assert (select g.slug from public.bucket_items b join public.goals g on g.id = b.goal_id
          where b.title = 'see the NORTHERN lights') = 'see-the-northern-lights', 'title matched seeded goal';
  assert (select g.slug from public.bucket_items b join public.goals g on g.id = b.goal_id
          where b.title = 'Escalar el Kilimanjaro') = 'climb-mount-kilimanjaro', 'Spanish alias matched';
  assert (select g.status from public.bucket_items b join public.goals g on g.id = b.goal_id
          where b.title = 'Secret dream of mine') = 'pending', 'unknown title creates a pending goal';

  -- Same goal twice is rejected.
  begin
    perform public.add_bucket_item('Aurora borealis', null, 'public', 'en');
    raise exception 'duplicate goal accepted';
  exception when unique_violation then null;
  end;

  -- Items can't be inserted directly, and the goal link can't be changed.
  begin
    insert into public.bucket_items (owner_id, goal_id, title)
    select auth.uid(), id, 'direct' from public.goals where slug = 'go-skydiving';
    raise exception 'direct item insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.bucket_items set goal_id = (select id from public.goals where slug = 'go-skydiving');
    raise exception 'goal_id update allowed';
  exception when insufficient_privilege then null;
  end;
  update public.bucket_items set status = 'done' where title = 'Escalar el Kilimanjaro';
  assert (select completed_at is not null from public.bucket_items where status = 'done'), 'completed_at auto-set';

  -- Age and onboarding timestamps are RPC-only.
  begin
    update public.profiles set adult_confirmed_at = now() where id = auth.uid();
    raise exception 'adult_confirmed_at writable';
  exception when insufficient_privilege then null;
  end;

  -- Invalid interest is rejected by the CHECK constraint.
  begin
    update public.profiles set interests = '{knitting_wars}' where id = auth.uid();
    raise exception 'unknown interest accepted';
  exception when check_violation then null;
  end;

  -- Alice cannot edit Bob's profile (silently 0 rows).
  update public.profiles set bio = 'hacked' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  assert n = 0, 'alice must not update bob''s profile';

  assert (select count(*) from public.search_goals('aurora', 'en', 5) where title = 'See the Northern Lights') = 1, 'search finds goal by alias';
  assert (select count(*) from public.search_goals('', 'en', 20)) >= 10, 'empty search returns featured goals';
end $$;

-- ---------- Act as Bob ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Onboarding can't finish before the 18+ confirmation.
  begin
    perform public.complete_onboarding();
    raise exception 'onboarding completed without age confirmation';
  exception when insufficient_privilege then null;
  end;
  perform public.confirm_adult();
  perform public.complete_onboarding();

  assert (select count(*) from public.bucket_items) = 2, 'bob sees only alice''s public items';
  assert not exists (select 1 from public.bucket_items where title = 'Secret dream of mine'), 'private item hidden';
  assert not exists (select 1 from public.goals where status = 'pending'), 'others'' pending goals hidden';
  assert (select count(*) from public.goal_aliases) = 0, 'aliases are not readable by clients';
  assert (select count(*) from public.profile_locations) = 0, 'bob cannot read alice''s location';
  assert not public.has_my_location(), 'bob has no location';
  assert (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'alice', 'profiles are public';
  assert (select completed_count from public.profile_stats('00000000-0000-0000-0000-00000000000a')) = 1, 'completed count visible';

  -- Bob's identical wording does NOT attach to Alice's pending goal.
  perform public.add_bucket_item('Secret dream of mine', null, 'public', 'en');
  assert (select count(distinct goal_id) from public.bucket_items where title = 'Secret dream of mine') = 1, 'bob sees only his own copy';

  update public.bucket_items set title = 'hijacked' where owner_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, 'bob must not update alice''s items';

  delete from public.bucket_items where owner_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, 'bob must not delete alice''s items';

  begin
    insert into public.profile_locations (user_id, location)
    values ('00000000-0000-0000-0000-00000000000a', 'SRID=4326;POINT(0 0)');
    raise exception 'bob wrote alice''s location';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.set_my_location(123, 0);
    raise exception 'invalid latitude accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Bob can't link to Alice's pending goal by id.
  begin
    perform public.add_bucket_item('sneaky', (select goal_id from public.bucket_items
                                               where owner_id = '00000000-0000-0000-0000-00000000000b'
                                                 and title = 'Secret dream of mine'), 'public', 'en');
    -- That goal is Bob's own, so this must fail only as a duplicate.
    raise exception 'duplicate allowed';
  exception when unique_violation then null;
  end;
end $$;

-- ---------- Act as a signed-out visitor ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$ begin
  assert (select count(*) from public.bucket_items) = 3, 'anon sees public items only';
  assert (select count(*) from public.goals where status = 'pending') = 0, 'anon sees no pending goals';
  begin
    perform 1 from public.profile_locations;
    raise exception 'anon could query profile_locations';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_my_location(0, 0);
    raise exception 'anon could call set_my_location';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_bucket_item('anon item');
    raise exception 'anon could add an item';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Email never leaves auth.users: profiles has no email/phone column.
do $$ begin
  assert not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name in ('email', 'phone')
  ), 'profiles must not contain email or phone';
end $$;

reset role;
select 'ALL RLS CHECKS PASSED' as result;
rollback;
