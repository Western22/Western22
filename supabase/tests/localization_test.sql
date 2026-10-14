-- =============================================================================
-- Localization smoke test (migration 0011): region settings, exchange rates,
-- the translation cache and the Translate button's limits, and who can see
-- what. Rolls back. Local database only:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/localization_test.sql
-- Success prints "ALL LOCALIZATION CHECKS PASSED".
-- =============================================================================
begin;

insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || k)::uuid, k || '@example.com',
       jsonb_build_object('display_name', n, 'adult_confirmed', true)
from (values ('e1','Eva'),('f2','Femi')) v(k, n);

-- ---------- Region settings: own row only, validated ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select public.update_region_settings('EUR', 'imperial');
do $$ begin
  assert (select currency from public.profile_settings where user_id = auth.uid()) = 'EUR', 'currency saved';
  assert (select units from public.profile_settings where user_id = auth.uid()) = 'imperial', 'units saved';
  assert (select count(*) from public.profile_settings where user_id = '00000000-0000-0000-0000-0000000000f2') = 0,
    'other people''s settings are invisible';
end $$;
select public.update_region_settings(null, null);
do $$ begin
  assert (select currency is null and units is null from public.profile_settings where user_id = auth.uid()), 'null means automatic';
end $$;
do $$ begin
  begin
    perform public.update_region_settings('euro', null);
    assert false, 'bad currency accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.update_region_settings(null, 'furlongs');
    assert false, 'bad units accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;
-- Writing currency straight into the table still hits the check constraint.
do $$ begin
  begin
    update public.profile_settings set currency = 'eur' where user_id = auth.uid();
    assert false, 'lowercase currency stored';
  exception when check_violation or insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Exchange rates: public read, server-only write ----------
insert into public.exchange_rates (currency, per_usd, rate_date, source) values ('EUR', 0.92, current_date, 'ECB'), ('JPY', 150, current_date, 'ECB');
set local role anon;
do $$ begin
  assert (select count(*) from public.exchange_rates) = 2, 'anyone can read rates';
  begin
    insert into public.exchange_rates (currency, per_usd, rate_date, source) values ('GBP', 0.8, current_date, 'me');
    assert false, 'anon wrote a rate';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
do $$ begin
  begin
    update public.exchange_rates set per_usd = 1 where currency = 'EUR';
    assert false, 'a user changed a rate';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Translation cache and usage: no client access at all ----------
do $$ begin
  begin
    perform 1 from public.content_translations;
    assert false, 'users can read the translation cache';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.content_translations (source_hash, target_lang, translated, provider)
    values (repeat('a', 64), 'en', 'fake', 'me');
    assert false, 'users can plant a translation';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.translation_usage;
    assert false, 'users can read usage';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.translation_allowed(auth.uid(), 10);
    assert false, 'users can call the limit check';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Limits: 60 an hour, 20,000 uncached characters a day ----------
set local role service_role;
do $$
declare eva uuid := '00000000-0000-0000-0000-0000000000e1';
begin
  assert public.translation_allowed(eva, 500), 'fresh user is allowed';
  assert not public.translation_allowed(eva, 20001), 'one text over the daily budget is refused';
  insert into public.translation_usage (user_id, chars, cached) values (eva, 19000, false);
  assert public.translation_allowed(eva, 1000), 'exactly at the daily budget is fine';
  assert not public.translation_allowed(eva, 1001), 'over the daily budget is refused';
  assert public.translation_allowed(eva, 0), 'cache hits still allowed when characters run out';
  insert into public.translation_usage (user_id, chars, cached) select eva, 0, true from generate_series(1, 59);
  assert not public.translation_allowed(eva, 0), '60 an hour, cache hits included';
  assert public.translation_allowed('00000000-0000-0000-0000-0000000000f2', 100), 'limits are per person';
  -- Yesterday's usage doesn't count, and pruning removes rows older than two days.
  update public.translation_usage set created_at = now() - interval '3 days' where user_id = eva;
  assert public.translation_allowed(eva, 20000), 'old usage no longer counts';
  perform public.prune_translation_usage();
  assert (select count(*) from public.translation_usage where user_id = eva) = 0, 'old usage pruned';
end $$;

-- The cache accepts what the server writes and rejects malformed keys.
insert into public.content_translations (source_hash, target_lang, translated, source_lang, provider)
values (encode(sha256('Hola'::bytea), 'hex'), 'en', 'Hello', 'es', 'deepl');
do $$ begin
  begin
    insert into public.content_translations (source_hash, target_lang, translated, provider) values ('nothex', 'en', 'x', 'deepl');
    assert false, 'bad hash accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Deleting the account removes its usage rows.
insert into public.translation_usage (user_id, chars) values ('00000000-0000-0000-0000-0000000000f2', 10);
delete from auth.users where id = '00000000-0000-0000-0000-0000000000f2';
do $$ begin
  assert (select count(*) from public.translation_usage where user_id = '00000000-0000-0000-0000-0000000000f2') = 0, 'usage goes with the account';
end $$;

select 'ALL LOCALIZATION CHECKS PASSED';
rollback;
