-- =============================================================================
-- RLS smoke test. Runs inside one transaction and rolls back, so it leaves no
-- data behind. Run against a local database only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Every check raises an exception on failure; success prints "ALL RLS CHECKS PASSED".
-- =============================================================================
begin;

-- Two users, created the way Supabase Auth would (fires the profile trigger).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name":"Alice","locale":"pt-BR"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"locale":"not a locale"}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'signup trigger should create profiles';
  assert (select locale from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'pt-BR', 'valid locale kept';
  assert (select locale from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'en', 'invalid locale falls back to en';
end $$;

-- ---------- Act as Alice ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

update public.profiles set username = 'alice', bio = 'hi' where id = '00000000-0000-0000-0000-00000000000a';
select public.set_my_location(5.6037, -0.1870);  -- Accra
insert into public.bucket_items (owner_id, title, visibility) values
  ('00000000-0000-0000-0000-00000000000a', 'See the northern lights', 'public'),
  ('00000000-0000-0000-0000-00000000000a', 'Secret dream', 'private');
insert into public.bucket_items (owner_id, title, status) values
  ('00000000-0000-0000-0000-00000000000a', 'Learn tango in Buenos Aires', 'done');

do $$
declare n int;
begin
  assert public.has_my_location(), 'alice sees her own location flag';
  assert (select count(*) from public.bucket_items) = 3, 'alice sees all her items';
  assert (select completed_at is not null from public.bucket_items where status = 'done'), 'completed_at auto-set';

  -- Alice cannot edit Bob's profile (silently 0 rows).
  update public.profiles set bio = 'hacked' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  assert n = 0, 'alice must not update bob''s profile';

  -- Alice cannot create an item owned by Bob.
  begin
    insert into public.bucket_items (owner_id, title) values ('00000000-0000-0000-0000-00000000000b', 'forged');
    raise exception 'alice inserted an item for bob';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Act as Bob ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare n int;
begin
  assert (select count(*) from public.bucket_items) = 2, 'bob sees only alice''s public items';
  assert not exists (select 1 from public.bucket_items where title = 'Secret dream'), 'private item hidden';
  assert (select count(*) from public.profile_locations) = 0, 'bob cannot read alice''s location';
  assert not public.has_my_location(), 'bob has no location';
  assert (select username from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'alice', 'profiles are public';

  update public.bucket_items set title = 'hijacked' where owner_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, 'bob must not update alice''s items';

  delete from public.bucket_items where owner_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, 'bob must not delete alice''s items';

  -- Bob cannot write a location row for Alice.
  begin
    insert into public.profile_locations (user_id, location)
    values ('00000000-0000-0000-0000-00000000000a', 'SRID=4326;POINT(0 0)');
    raise exception 'bob wrote alice''s location';
  exception when insufficient_privilege then null;
  end;

  -- Invalid coordinates are rejected.
  begin
    perform public.set_my_location(123, 0);
    raise exception 'invalid latitude accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---------- Act as a signed-out visitor ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$ begin
  assert (select count(*) from public.bucket_items) = 2, 'anon sees public items only';
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
