-- =============================================================================
-- Trust and safety
--
--   * Verification tier: phone (from Supabase Auth) now, ID later via a
--     provider hook. Shown as a badge; the phone number itself never leaves auth.
--   * Reports on people, messages, stories, comments and groups, in one table,
--     with a moderation queue and actions (dismiss, warn, remove, suspend).
--   * A text moderation safety net in the database (moderation_terms), next to
--     the pluggable provider the app runs (src/lib/moderation).
--   * Suspensions enforced on every write, rate limits on messages, follows and
--     reports.
--   * Meetup safety: tips acknowledged once, and "share my plan" links for a
--     trusted contact.
--   * Privacy: hide from matching, approximate location, data export, and the
--     database half of account deletion.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Private per-user settings (owner-only)
-- ---------------------------------------------------------------------------
create table public.profile_settings (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  hide_from_matching   boolean not null default false,
  -- 'standard' snaps the home point to ~5 km, 'approximate' to ~25 km.
  location_precision   text not null default 'standard' check (location_precision in ('standard', 'approximate')),
  safety_tips_seen_at  timestamptz,
  updated_at           timestamptz not null default now()
);
alter table public.profile_settings enable row level security;
revoke all on public.profile_settings from anon;
revoke insert, update, delete on public.profile_settings from authenticated;
create policy "owner reads settings" on public.profile_settings for select to authenticated
  using (user_id = (select auth.uid()));

-- Change privacy settings. Switching to approximate coarsens the stored home
-- point right away; switching back needs a fresh "use my location".
create or replace function public.update_privacy_settings(p_hide_from_matching boolean, p_approximate_location boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  loc extensions.geography;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.profile_settings (user_id, hide_from_matching, location_precision)
  values (uid, p_hide_from_matching, case when p_approximate_location then 'approximate' else 'standard' end)
  on conflict (user_id) do update
    set hide_from_matching = excluded.hide_from_matching,
        location_precision = excluded.location_precision,
        updated_at = now();
  if p_approximate_location then
    select location into loc from public.profile_locations where user_id = uid;
    if loc is not null then
      perform public.set_my_location(extensions.st_y(loc::extensions.geometry), extensions.st_x(loc::extensions.geometry));
    end if;
  end if;
end;
$$;

create or replace function public.acknowledge_safety_tips()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.profile_settings (user_id, safety_tips_seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set safety_tips_seen_at = coalesce(public.profile_settings.safety_tips_seen_at, now());
$$;

-- set_my_location now honours the approximate setting (~25 km grid instead of ~5 km).
create or replace function public.set_my_location(lat double precision, lng double precision)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  step_lat double precision := 0.045;
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
  if exists (select 1 from public.profile_settings where user_id = auth.uid() and location_precision = 'approximate') then
    step_lat := 0.225;
  end if;

  snapped_lat := greatest(-90, least(90, round(lat / step_lat) * step_lat));
  step_lng := step_lat / greatest(cos(radians(snapped_lat)), 0.01);
  snapped_lng := round(lng / step_lng) * step_lng;
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
-- Verification tier
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column phone_verified_at timestamptz,
  add column id_verified_at timestamptz;
comment on column public.profiles.phone_verified_at is
  'When the account confirmed a phone with Supabase Auth. The number stays in auth.users.';
comment on column public.profiles.id_verified_at is
  'Set only by an ID verification provider hook (set_id_verified, service role).';
-- No client grants: profiles already restricts updates to listed columns.

-- Mirror Supabase Auth's phone confirmation onto the public profile.
create or replace function public.sync_phone_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set phone_verified_at = case
           when new.phone_confirmed_at is not null and coalesce(new.phone, '') <> ''
             then coalesce(case when old.phone is not distinct from new.phone then phone_verified_at end, new.phone_confirmed_at)
           else null end
   where id = new.id;
  return new;
end;
$$;
create trigger on_auth_phone_change
  after update of phone, phone_confirmed_at on auth.users
  for each row execute function public.sync_phone_verification();

-- Hook for an ID verification provider (e.g. Stripe Identity). Call it from a
-- server-side webhook with the service role once the provider confirms a match.
-- TODO(id-verification): add the provider webhook (see src/lib/verification/id-provider.ts).
create or replace function public.set_id_verified(p_user_id uuid, p_verified boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set id_verified_at = case when p_verified then coalesce(id_verified_at, now()) end
  where id = p_user_id;
$$;
revoke execute on function public.set_id_verified(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_id_verified(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Account status: suspensions and warnings
-- ---------------------------------------------------------------------------
create table public.account_status (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  suspended_until  timestamptz,
  reason           text check (char_length(reason) <= 500),
  updated_at       timestamptz not null default now()
);
alter table public.account_status enable row level security;
revoke all on public.account_status from anon;
revoke insert, update, delete on public.account_status from authenticated;
create policy "owner and moderators read status" on public.account_status for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_moderator()));

create table public.user_warnings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  moderator_id     uuid references public.profiles (id) on delete set null,
  message          text not null check (char_length(message) between 1 and 500),
  created_at       timestamptz not null default now(),
  acknowledged_at  timestamptz
);
create index user_warnings_user_idx on public.user_warnings (user_id, created_at desc);
alter table public.user_warnings enable row level security;
revoke all on public.user_warnings from anon;
revoke insert, update, delete on public.user_warnings from authenticated;
create policy "owner and moderators read warnings" on public.user_warnings for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_moderator()));

create or replace function public.is_suspended(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.account_status where user_id = p_user_id and suspended_until > now());
$$;
revoke execute on function public.is_suspended(uuid) from public, anon, authenticated;

create or replace function public.acknowledge_warning(p_warning_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_warnings set acknowledged_at = coalesce(acknowledged_at, now())
  where id = p_warning_id and user_id = auth.uid();
$$;

-- What the header shows the signed-in person: a suspension and unread warnings.
create or replace function public.my_account_notices()
returns table (suspended_until timestamptz, warning_id uuid, warning text, warned_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.suspended_until, null::uuid, null::text, null::timestamptz
    from public.account_status s where s.user_id = auth.uid() and s.suspended_until > now()
  union all
  select null, w.id, w.message, w.created_at
    from public.user_warnings w where w.user_id = auth.uid() and w.acknowledged_at is null;
$$;

-- Suspended people can read but not write. One trigger, attached to every
-- table people write to (directly or through RPCs).
create or replace function public.forbid_suspended_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and public.is_suspended(auth.uid()) then
    raise exception 'account suspended' using errcode = '42501', hint = 'suspended';
  end if;
  return new;
end;
$$;

create trigger forbid_suspended before insert on public.bucket_items for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.follows for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.match_requests for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.groups for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.group_members for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.group_join_requests for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.group_messages for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.group_date_options for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.group_checklist_items for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.stories for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.story_comments for each row execute function public.forbid_suspended_writes();
create trigger forbid_suspended before insert on public.story_reactions for each row execute function public.forbid_suspended_writes();

-- Suspended or hidden people drop out of matching.
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
     and not exists (select 1 from public.profile_settings s where s.user_id = p_item.owner_id and s.hide_from_matching)
     and not public.is_suspended(p_item.owner_id)
     and not public.is_blocked_between(p_item.owner_id, p_viewer);
$$;
revoke execute on function public.item_matchable_by(public.bucket_items, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate limits (54000 = "too many"; the app shows a friendly message)
-- ---------------------------------------------------------------------------
create or replace function public.limit_message_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.group_messages
       where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.group_messages
       where sender_id = new.sender_id and created_at > now() - interval '1 day') >= 500 then
    raise exception 'too many messages' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger limit_message_rate before insert on public.group_messages
  for each row execute function public.limit_message_rate();

create or replace function public.limit_follow_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.follows
       where follower_id = new.follower_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too many follows' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger limit_follow_rate before insert on public.follows
  for each row execute function public.limit_follow_rate();

-- ---------------------------------------------------------------------------
-- Reports: one table for people, messages, stories, comments and groups.
-- reporter_id is null for automatic flags from text moderation.
-- ---------------------------------------------------------------------------
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles (id) on delete cascade,
  target_type     text not null check (target_type in ('user', 'message', 'story', 'comment', 'group')),
  target_id       uuid not null,
  -- The person responsible: the reported user, or the content's author/owner.
  target_user_id  uuid references public.profiles (id) on delete cascade,
  reason          text not null check (reason in ('spam', 'harassment', 'hate', 'inappropriate', 'scam', 'safety', 'underage', 'other', 'auto')),
  details         text check (char_length(details) <= 500),
  status          text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles (id) on delete set null
);
create unique index reports_once_per_person on public.reports (reporter_id, target_type, target_id) where reporter_id is not null;
create index reports_open_idx on public.reports (status, created_at) where status = 'open';
create index reports_target_idx on public.reports (target_type, target_id);
alter table public.reports enable row level security;
revoke all on public.reports from anon;
revoke insert, update, delete on public.reports from authenticated;
create policy "reporters and moderators see reports" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_moderator()));

-- Keep earlier message reports.
insert into public.reports (reporter_id, target_type, target_id, target_user_id, reason, details, created_at)
select r.reporter_id, 'message', r.message_id, m.sender_id, r.reason, r.details, r.created_at
  from public.message_reports r join public.group_messages m on m.id = r.message_id;
drop function public.report_message(uuid, text, text);
drop table public.message_reports;

-- Who is responsible for a target, if the caller may see it; null otherwise.
create or replace function public.report_target_owner(p_type text, p_id uuid, p_viewer uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'user' then (select id from public.profiles where id = p_id)
    when 'message' then (select m.sender_id from public.group_messages m
                          where m.id = p_id and public.group_has_member(m.group_id, p_viewer))
    when 'story' then (select s.author_id from public.stories s where s.id = p_id)
    when 'comment' then (select c.author_id from public.story_comments c where c.id = p_id)
    when 'group' then (select g.owner_id from public.groups g where g.id = p_id)
  end;
$$;
revoke execute on function public.report_target_owner(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.report_content(p_target_type text, p_target_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_reason = 'auto' then raise exception 'invalid reason' using errcode = '22023'; end if;
  owner := public.report_target_owner(p_target_type, p_target_id, uid);
  -- You can't report yourself or your own content (a group you own included).
  if owner is null or owner = uid then raise exception 'not found' using errcode = '22023'; end if;
  if (select count(*) from public.reports where reporter_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many reports' using errcode = '54000';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, target_user_id, reason, details)
  values (uid, p_target_type, p_target_id, owner, p_reason, nullif(trim(p_details), ''))
  on conflict (reporter_id, target_type, target_id) where reporter_id is not null do nothing;
  -- A message reported by 3 different people is hidden until reviewed.
  if p_target_type = 'message'
     and (select count(distinct reporter_id) from public.reports
           where target_type = 'message' and target_id = p_target_id and status = 'open') >= 3 then
    update public.group_messages set hidden_at = coalesce(hidden_at, now()) where id = p_target_id;
  end if;
end;
$$;

-- Kept for the chat's existing calls: same as report_content for a message.
create or replace function public.report_message(p_message_id uuid, p_reason text, p_details text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.report_content('message', p_message_id, p_reason, p_details);
$$;

-- The app's moderation provider flags the caller's own new content for review.
create or replace function public.flag_my_content(p_target_type text, p_target_id uuid, p_categories text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_target_type not in ('message', 'story', 'comment', 'group')
     or public.report_target_owner(p_target_type, p_target_id, auth.uid()) is distinct from auth.uid() then
    raise exception 'not found' using errcode = '22023';
  end if;
  -- One automatic flag per target: the database term list may already have flagged it.
  if exists (select 1 from public.reports where target_type = p_target_type and target_id = p_target_id and reporter_id is null) then
    update public.reports
       set details = left(concat_ws(', ', details, array_to_string(p_categories, ', ')), 500)
     where target_type = p_target_type and target_id = p_target_id and reporter_id is null;
  else
    insert into public.reports (reporter_id, target_type, target_id, target_user_id, reason, details)
    values (null, p_target_type, p_target_id, auth.uid(), 'auto', left(array_to_string(p_categories, ', '), 500));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Text moderation safety net. The app's provider (src/lib/moderation) runs
-- first; this catches anything written another way. Moderators manage terms.
-- ---------------------------------------------------------------------------
create table public.moderation_terms (
  phrase    text primary key check (phrase = lower(phrase) and char_length(phrase) between 2 and 100),
  action    text not null check (action in ('block', 'review')),
  category  text not null check (category in ('threat', 'hate', 'scam', 'spam', 'sexual', 'other'))
);
alter table public.moderation_terms enable row level security;
revoke all on public.moderation_terms from anon, authenticated;
-- Starter list: clear threats are blocked, common scam lines go to review.
-- TODO(moderation): grow this list with moderators, per language.
insert into public.moderation_terms (phrase, action, category) values
  ('i will kill you', 'block', 'threat'),
  ('kill yourself', 'block', 'threat'),
  ('western union', 'review', 'scam'),
  ('moneygram', 'review', 'scam'),
  ('gift card', 'review', 'scam'),
  ('wire transfer', 'review', 'scam'),
  ('send me money', 'review', 'scam'),
  ('crypto investment', 'review', 'scam'),
  ('guaranteed returns', 'review', 'scam');

-- The strongest action any term triggers in the text, and its category.
create or replace function public.text_moderation_verdict(p_text text)
returns table (action text, category text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.action, t.category from public.moderation_terms t
  where p_text is not null and position(t.phrase in lower(p_text)) > 0
  order by t.action = 'block' desc
  limit 1;
$$;
revoke execute on function public.text_moderation_verdict(text) from public, anon, authenticated;

-- BEFORE INSERT: block. TG_ARGV[0] names the target type for review flags.
create or replace function public.moderate_new_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  txt text;
  verdict record;
begin
  -- IF branches, not CASE: a CASE would resolve every table's columns on NEW.
  if tg_table_name = 'stories' then txt := concat_ws(' ', new.body, new.place);
  elsif tg_table_name = 'groups' then txt := concat_ws(' ', new.name, new.description);
  else txt := new.body;
  end if;
  select * into verdict from public.text_moderation_verdict(txt);
  if verdict.action = 'block' then
    raise exception 'content blocked' using errcode = '23514', hint = 'blocked:' || verdict.category;
  end if;
  return new;
end;
$$;

-- AFTER INSERT: flag for review.
create or replace function public.flag_new_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  txt text;
  author uuid;
  verdict record;
begin
  -- IF branches, not CASE: a CASE would resolve every table's columns on NEW.
  if tg_table_name = 'stories' then txt := concat_ws(' ', new.body, new.place);
  elsif tg_table_name = 'groups' then txt := concat_ws(' ', new.name, new.description);
  else txt := new.body;
  end if;
  if tg_table_name = 'group_messages' then author := new.sender_id;
  elsif tg_table_name = 'groups' then author := new.owner_id;
  else author := new.author_id;
  end if;
  select * into verdict from public.text_moderation_verdict(txt);
  if verdict.action = 'review' then
    insert into public.reports (reporter_id, target_type, target_id, target_user_id, reason, details)
    values (null, tg_argv[0], new.id, author, 'auto', verdict.category);
  end if;
  return null;
end;
$$;

create trigger moderate_text before insert on public.group_messages for each row execute function public.moderate_new_text();
create trigger moderate_text before insert on public.stories for each row execute function public.moderate_new_text();
create trigger moderate_text before insert on public.story_comments for each row execute function public.moderate_new_text();
create trigger moderate_text before insert on public.groups for each row execute function public.moderate_new_text();
create trigger flag_text after insert on public.group_messages for each row execute function public.flag_new_text('message');
create trigger flag_text after insert on public.stories for each row execute function public.flag_new_text('story');
create trigger flag_text after insert on public.story_comments for each row execute function public.flag_new_text('comment');
create trigger flag_text after insert on public.groups for each row execute function public.flag_new_text('group');

-- ---------------------------------------------------------------------------
-- Moderation queue and actions (moderators only)
-- ---------------------------------------------------------------------------
create table public.moderation_actions (
  id              uuid primary key default gen_random_uuid(),
  moderator_id    uuid references public.profiles (id) on delete set null,
  action          text not null check (action in ('dismiss', 'warn', 'remove', 'suspend', 'unsuspend')),
  target_type     text not null,
  target_id       uuid not null,
  target_user_id  uuid references public.profiles (id) on delete set null,
  note            text check (char_length(note) <= 500),
  -- What the content said when it was acted on (removed content is gone).
  snapshot        text check (char_length(snapshot) <= 2000),
  created_at      timestamptz not null default now()
);
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon;
revoke insert, update, delete on public.moderation_actions from authenticated;
create policy "moderators read the log" on public.moderation_actions for select to authenticated
  using ((select public.is_moderator()));

-- A short text version of any target, for the queue and the log.
create or replace function public.report_target_preview(p_type text, p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(case p_type
    when 'user' then (select concat_ws(' · ', p.display_name, '@' || p.username, p.bio) from public.profiles p where p.id = p_id)
    when 'message' then (select concat_ws(' ', m.body, case when m.image_path is not null then '[photo]' end)
                           from public.group_messages m where m.id = p_id)
    when 'story' then (select concat_ws(' · ', s.body, s.place) from public.stories s where s.id = p_id)
    when 'comment' then (select c.body from public.story_comments c where c.id = p_id)
    when 'group' then (select concat_ws(' · ', g.name, g.description) from public.groups g where g.id = p_id)
  end, 2000);
$$;
revoke execute on function public.report_target_preview(text, uuid) from public, anon, authenticated;

create or replace function public.require_moderator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then raise exception 'moderators only' using errcode = '42501'; end if;
  return auth.uid();
end;
$$;
revoke execute on function public.require_moderator() from public, anon, authenticated;

-- One row per reported target, most-reported and oldest first.
create or replace function public.moderation_queue(p_status text default 'open', p_limit int default 50)
returns table (
  target_type text, target_id uuid, target_user_id uuid,
  target_username text, target_display_name text,
  preview text, content_exists boolean, report_count int, reasons text[], details text[],
  auto_flagged boolean, first_reported_at timestamptz, last_reported_at timestamptz,
  suspended_until timestamptz, warning_count int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_moderator();
  return query
  select r.target_type, r.target_id, max(r.target_user_id::text)::uuid,
         p.username, p.display_name,
         public.report_target_preview(r.target_type, r.target_id),
         public.report_target_preview(r.target_type, r.target_id) is not null,
         count(*)::int,
         array_agg(distinct r.reason),
         array_remove(array_agg(r.details order by r.created_at), null),
         bool_or(r.reporter_id is null),
         min(r.created_at), max(r.created_at),
         (select s.suspended_until from public.account_status s where s.user_id = max(r.target_user_id::text)::uuid and s.suspended_until > now()),
         (select count(*)::int from public.user_warnings w where w.user_id = max(r.target_user_id::text)::uuid)
    from public.reports r
    left join public.profiles p on p.id = r.target_user_id
   where r.status = p_status
   group by r.target_type, r.target_id, p.username, p.display_name
   order by count(*) desc, min(r.created_at)
   limit least(greatest(p_limit, 1), 200);
end;
$$;

-- Act on a reported target. p_suspend_days null with 'suspend' = indefinitely.
-- Returns the responsible person's id, so the app can also sign them out.
create or replace function public.moderate(
  p_target_type text, p_target_id uuid, p_action text,
  p_note text default null, p_suspend_days int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  mod_id uuid := public.require_moderator();
  who uuid;
  snap text := public.report_target_preview(p_target_type, p_target_id);
begin
  if p_action not in ('dismiss', 'warn', 'remove', 'suspend', 'unsuspend') then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  who := coalesce(
    (select target_user_id from public.reports where target_type = p_target_type and target_id = p_target_id and target_user_id is not null limit 1),
    public.report_target_owner(p_target_type, p_target_id, mod_id),
    case when p_target_type = 'user' then p_target_id end);
  if who = mod_id and p_action <> 'dismiss' then raise exception 'not on yourself' using errcode = '42501'; end if;

  if p_action = 'warn' then
    if who is null or coalesce(trim(p_note), '') = '' then raise exception 'warning needs a person and a message' using errcode = '22023'; end if;
    insert into public.user_warnings (user_id, moderator_id, message) values (who, mod_id, trim(p_note));
  elsif p_action = 'remove' then
    case p_target_type
      when 'message' then update public.group_messages set hidden_at = coalesce(hidden_at, now()) where id = p_target_id;
      when 'story' then delete from public.stories where id = p_target_id;
      when 'comment' then delete from public.story_comments where id = p_target_id;
      when 'group' then delete from public.groups where id = p_target_id;
      else raise exception 'suspend people instead of removing them' using errcode = '22023';
    end case;
  elsif p_action = 'suspend' then
    if who is null then raise exception 'nobody to suspend' using errcode = '22023'; end if;
    insert into public.account_status (user_id, suspended_until, reason)
    values (who, case when p_suspend_days is null then 'infinity'::timestamptz else now() + make_interval(days => p_suspend_days) end, nullif(trim(p_note), ''))
    on conflict (user_id) do update
      set suspended_until = excluded.suspended_until, reason = excluded.reason, updated_at = now();
  elsif p_action = 'unsuspend' then
    update public.account_status set suspended_until = null, updated_at = now() where user_id = who;
  end if;

  update public.reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
         resolved_at = now(), resolved_by = mod_id
   where target_type = p_target_type and target_id = p_target_id and status = 'open';
  insert into public.moderation_actions (moderator_id, action, target_type, target_id, target_user_id, note, snapshot)
  values (mod_id, p_action, p_target_type, p_target_id, who, nullif(trim(p_note), ''), snap);
  return who;
end;
$$;

-- ---------------------------------------------------------------------------
-- Share my plan with a trusted contact: a private, expiring link to a
-- read-only summary of a group's plan. Nothing about the contact is stored
-- except the label the person gives it.
-- ---------------------------------------------------------------------------
create table public.plan_shares (
  id            uuid primary key default gen_random_uuid(),  -- the link token
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  contact_name  text not null check (char_length(contact_name) between 1 and 60),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index plan_shares_user_idx on public.plan_shares (user_id, group_id);
alter table public.plan_shares enable row level security;
revoke all on public.plan_shares from anon;
revoke insert, update, delete on public.plan_shares from authenticated;
create policy "owner reads shares" on public.plan_shares for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.create_plan_share(p_group_id uuid, p_contact_name text, p_days int default 14)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_onboarded();
  share_id uuid;
begin
  if not public.group_has_member(p_group_id, uid) then raise exception 'not a member' using errcode = '42501'; end if;
  if coalesce(trim(p_contact_name), '') = '' or p_days not between 1 and 60 then
    raise exception 'invalid share' using errcode = '22023';
  end if;
  if (select count(*) from public.plan_shares
       where user_id = uid and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'too many shares' using errcode = '54000';
  end if;
  insert into public.plan_shares (group_id, user_id, contact_name, expires_at)
  values (p_group_id, uid, trim(p_contact_name), now() + make_interval(days => p_days))
  returning id into share_id;
  return share_id;
end;
$$;

create or replace function public.revoke_plan_share(p_share_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.plan_shares set revoked_at = coalesce(revoked_at, now())
  where id = p_share_id and user_id = auth.uid();
$$;

-- What the trusted contact sees. Valid while not expired or revoked and the
-- sharer is still in the group. Anyone with the link can read it.
create or replace function public.shared_plan(p_share_id uuid, p_locale text default 'en')
returns table (
  sharer_name text, goal_title text, group_name text, status text,
  location text, dates jsonb, members text[], expires_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.display_name, p.username), public.goal_title(g.goal_id, p_locale), g.name, g.status,
         pl.location_text,
         coalesce((select jsonb_agg(jsonb_build_object('starts_on', d.starts_on, 'ends_on', d.ends_on, 'votes', d.votes) order by d.votes desc, d.starts_on)
                     from (select o.starts_on, o.ends_on, (select count(*) from public.group_date_votes v where v.option_id = o.id) votes
                             from public.group_date_options o where o.group_id = g.id) d), '[]'::jsonb),
         array(select coalesce(mp.display_name, mp.username) from public.group_members m
                 join public.profiles mp on mp.id = m.user_id where m.group_id = g.id order by m.joined_at),
         s.expires_at, greatest(g.updated_at, pl.updated_at)
    from public.plan_shares s
    join public.groups g on g.id = s.group_id
    join public.profiles p on p.id = s.user_id
    left join public.group_plans pl on pl.group_id = g.id
   where s.id = p_share_id and s.revoked_at is null and s.expires_at > now()
     and public.group_has_member(s.group_id, s.user_id);
$$;

-- ---------------------------------------------------------------------------
-- Your data: export everything about you, and prepare account deletion.
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'phone', nullif(u.phone, ''), 'created_at', u.created_at,
                                          'last_sign_in_at', u.last_sign_in_at)
                  from auth.users u where u.id = auth.uid()),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'settings', (select to_jsonb(s) - 'user_id' from public.profile_settings s where s.user_id = auth.uid()),
    'home_location_snapped', (select jsonb_build_object('lat', extensions.st_y(l.location::extensions.geometry),
                                                        'lng', extensions.st_x(l.location::extensions.geometry))
                                from public.profile_locations l where l.user_id = auth.uid()),
    'bucket_items', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from public.bucket_items b where b.owner_id = auth.uid()), '[]'),
    'following', coalesce((select jsonb_agg(p.username) from public.follows f join public.profiles p on p.id = f.followee_id where f.follower_id = auth.uid()), '[]'),
    'followers', coalesce((select jsonb_agg(p.username) from public.follows f join public.profiles p on p.id = f.follower_id where f.followee_id = auth.uid()), '[]'),
    'blocked', coalesce((select jsonb_agg(p.username) from public.blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = auth.uid()), '[]'),
    'match_requests', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.match_requests m
                                 where auth.uid() in (m.sender_id, m.recipient_id)), '[]'),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('group', g.name, 'role', m.role, 'joined_at', m.joined_at))
                          from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = auth.uid()), '[]'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('group_id', m.group_id, 'body', m.body, 'image_path', m.image_path, 'created_at', m.created_at) order by m.created_at)
                            from public.group_messages m where m.sender_id = auth.uid()), '[]'),
    'stories', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.stories s where s.author_id = auth.uid()), '[]'),
    'comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.story_comments c where c.author_id = auth.uid()), '[]'),
    'reactions', coalesce((select jsonb_agg(to_jsonb(r)) from public.story_reactions r where r.user_id = auth.uid()), '[]'),
    'reports_made', coalesce((select jsonb_agg(jsonb_build_object('target_type', r.target_type, 'reason', r.reason, 'created_at', r.created_at, 'status', r.status))
                                from public.reports r where r.reporter_id = auth.uid()), '[]'),
    'warnings', coalesce((select jsonb_agg(jsonb_build_object('message', w.message, 'created_at', w.created_at)) from public.user_warnings w where w.user_id = auth.uid()), '[]'),
    'plan_shares', coalesce((select jsonb_agg(jsonb_build_object('contact', s.contact_name, 'created_at', s.created_at, 'expires_at', s.expires_at))
                               from public.plan_shares s where s.user_id = auth.uid()), '[]')
  );
$$;

-- First half of deleting an account: hand group ownership on (so other
-- members keep their groups) and list the person's uploaded files. The app
-- then removes those files and deletes the auth user, which cascades to
-- every row above.
create or replace function public.prepare_account_deletion()
returns table (bucket_id text, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  for gid in select group_id from public.group_members where user_id = uid loop
    perform public.leave_group(gid);
  end loop;
  return query select o.bucket_id, o.name from storage.objects o
    where o.owner_id = uid::text and o.bucket_id in ('avatars', 'stories', 'group-media');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.update_privacy_settings(boolean, boolean) from public, anon;
revoke execute on function public.acknowledge_safety_tips() from public, anon;
revoke execute on function public.acknowledge_warning(uuid) from public, anon;
revoke execute on function public.my_account_notices() from public, anon;
revoke execute on function public.report_content(text, uuid, text, text) from public, anon;
revoke execute on function public.report_message(uuid, text, text) from public, anon;
revoke execute on function public.flag_my_content(text, uuid, text[]) from public, anon;
revoke execute on function public.moderation_queue(text, int) from public, anon;
revoke execute on function public.moderate(text, uuid, text, text, int) from public, anon;
revoke execute on function public.create_plan_share(uuid, text, int) from public, anon;
revoke execute on function public.revoke_plan_share(uuid) from public, anon;
revoke execute on function public.export_my_data() from public, anon;
revoke execute on function public.prepare_account_deletion() from public, anon;
revoke execute on function public.forbid_suspended_writes() from public, anon, authenticated;
revoke execute on function public.limit_message_rate() from public, anon, authenticated;
revoke execute on function public.limit_follow_rate() from public, anon, authenticated;
revoke execute on function public.moderate_new_text() from public, anon, authenticated;
revoke execute on function public.flag_new_text() from public, anon, authenticated;
revoke execute on function public.sync_phone_verification() from public, anon, authenticated;

grant execute on function public.update_privacy_settings(boolean, boolean) to authenticated;
grant execute on function public.acknowledge_safety_tips() to authenticated;
grant execute on function public.acknowledge_warning(uuid) to authenticated;
grant execute on function public.my_account_notices() to authenticated;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;
grant execute on function public.report_message(uuid, text, text) to authenticated;
grant execute on function public.flag_my_content(text, uuid, text[]) to authenticated;
grant execute on function public.moderation_queue(text, int) to authenticated;
grant execute on function public.moderate(text, uuid, text, text, int) to authenticated;
grant execute on function public.create_plan_share(uuid, text, int) to authenticated;
grant execute on function public.revoke_plan_share(uuid) to authenticated;
grant execute on function public.shared_plan(uuid, text) to anon, authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.prepare_account_deletion() to authenticated;
