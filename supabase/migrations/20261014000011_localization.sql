-- =============================================================================
-- Increment 9: going global
--
--   * profile_settings gets each person's currency and units (null = pick from
--     their home country). Owner-only, like the rest of profile_settings.
--     The UI language stays in profiles.locale (already there since 0001).
--   * exchange_rates: daily reference rates (European Central Bank), used to
--     show budget ranges in the viewer's currency. Public data, readable by
--     everyone; only the server's secret key writes it.
--   * content_translations: cache for the Translate button, so each text is
--     translated once per language. Server only (no client access), so nobody
--     can plant a fake translation.
--   * translation_usage: per-person log for the Translate button's limits.
-- =============================================================================

alter table public.profile_settings
  add column currency text check (currency ~ '^[A-Z]{3}$'),
  add column units text check (units in ('metric', 'imperial'));

-- Currency and units from the settings page. Null means "automatic".
create or replace function public.update_region_settings(p_currency text, p_units text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_currency is not null and p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid currency' using errcode = '22023';
  end if;
  if p_units is not null and p_units not in ('metric', 'imperial') then
    raise exception 'invalid units' using errcode = '22023';
  end if;
  insert into public.profile_settings (user_id, currency, units) values (uid, p_currency, p_units)
  on conflict (user_id) do update set currency = excluded.currency, units = excluded.units;
end;
$$;
revoke execute on function public.update_region_settings(text, text) from public, anon;
grant execute on function public.update_region_settings(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Exchange rates
-- ---------------------------------------------------------------------------
create table public.exchange_rates (
  currency    text primary key check (currency ~ '^[A-Z]{3}$'),
  -- Units of this currency per 1 US dollar (USD itself is 1).
  per_usd     numeric not null check (per_usd > 0),
  -- The publication date of the reference rate (e.g. ECB's daily fixing).
  rate_date   date not null,
  source      text not null check (char_length(source) <= 40),
  updated_at  timestamptz not null default now()
);
alter table public.exchange_rates enable row level security;
revoke insert, update, delete on public.exchange_rates from anon, authenticated;
create policy "exchange rates are public" on public.exchange_rates for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Translation cache and limits (server only)
-- ---------------------------------------------------------------------------
create table public.content_translations (
  -- sha256 of the original text, so the cache never stores who wrote it or where.
  source_hash  text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  target_lang  text not null check (target_lang ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  translated   text not null check (char_length(translated) <= 8000),
  source_lang  text check (char_length(source_lang) <= 10),
  provider     text not null check (char_length(provider) <= 40),
  created_at   timestamptz not null default now(),
  primary key (source_hash, target_lang)
);
alter table public.content_translations enable row level security;
revoke all on public.content_translations from anon, authenticated;

create table public.translation_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  chars       integer not null check (chars >= 0),
  cached      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index translation_usage_user_idx on public.translation_usage (user_id, created_at desc);
alter table public.translation_usage enable row level security;
revoke all on public.translation_usage from anon, authenticated;

-- Server-side check before calling the provider: 60 translations an hour and
-- 20,000 uncached characters a day per person. Cache hits only count toward
-- the hourly number.
create or replace function public.translation_allowed(p_user uuid, p_chars integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.translation_usage
           where user_id = p_user and created_at > now() - interval '1 hour') < 60
     and (select coalesce(sum(chars), 0) from public.translation_usage
           where user_id = p_user and not cached and created_at > now() - interval '1 day') + p_chars <= 20000;
$$;
revoke execute on function public.translation_allowed(uuid, integer) from public, anon, authenticated;
grant execute on function public.translation_allowed(uuid, integer) to service_role;

-- Old usage rows aren't needed after a day; the exchange-rate cron prunes them.
create or replace function public.prune_translation_usage()
returns void
language sql
security definer
set search_path = ''
as $$ delete from public.translation_usage where created_at < now() - interval '2 days'; $$;
revoke execute on function public.prune_translation_usage() from public, anon, authenticated;
grant execute on function public.prune_translation_usage() to service_role;
