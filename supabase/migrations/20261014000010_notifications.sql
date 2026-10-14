-- =============================================================================
-- Increment 8: notifications
--
--   * notifications: the in-app notification center. Database triggers create
--     them from real events (new match, buddy request, request accepted, group
--     message, plan vote needed, story reaction) and a scheduled job adds
--     "date approaching" reminders. Chatty types are batched: while one is
--     unread, new events bump its count instead of adding rows.
--   * notification_preferences: per type, per channel (in app, email, push),
--     falling back to defaults in notification_default().
--   * notification_settings: time zone, quiet hours, "pause all email", the
--     unsubscribe token and when the weekly digest last went out.
--   * push_subscriptions: browsers that allowed web push.
--   * notification_deliveries: the email/push outbox. Only the server (secret
--     key) reads it: the cron route claims due rows, sends them and reports
--     back. Quiet hours and batching delays are applied here, not in the app.
--
-- Every table has RLS. Email addresses never leave auth.users except to the
-- server-only claim function; push keys are readable only by their owner.
-- All times are timestamptz (UTC); quiet hours are wall-clock times in the
-- person's own time zone.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Types and defaults
-- ---------------------------------------------------------------------------
create or replace function public.notification_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['new_match', 'buddy_request', 'request_accepted', 'group_message',
               'plan_vote', 'date_approaching', 'story_reaction', 'weekly_digest'];
$$;

-- Defaults when someone hasn't changed a setting. Email is for things worth an
-- inbox visit; chatty things (messages, reactions, matches) default to push
-- and the weekly digest. weekly_digest is email-only.
create or replace function public.notification_default(p_type text, p_channel text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type = 'weekly_digest' then p_channel = 'email'
    when p_channel = 'in_app' then true
    when p_channel = 'push' then true
    when p_channel = 'email' then p_type in ('buddy_request', 'request_accepted', 'plan_vote', 'date_approaching')
    else false
  end;
$$;

-- How long chatty notifications wait before email/push goes out, so a burst
-- of messages or reactions becomes one "5 new messages".
create or replace function public.notification_batch_window()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '10 minutes'; $$;

create or replace function public.notification_is_batched(p_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_type in ('group_message', 'story_reaction', 'new_match', 'plan_vote'); $$;

create or replace function public.is_valid_timezone(p_tz text)
returns boolean
language sql
stable
set search_path = ''
as $$ select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz); $$;

-- ---------------------------------------------------------------------------
-- Settings and preferences
-- ---------------------------------------------------------------------------
create table public.notification_settings (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  -- IANA name from the browser (e.g. "Africa/Accra"); null until we learn it (treated as UTC).
  timezone           text check (char_length(timezone) <= 64),
  -- Quiet hours as local wall-clock times; both null = off. May wrap midnight (22:00-07:00).
  quiet_start        time,
  quiet_end          time,
  -- "Pause all email" (also set by the one-click unsubscribe-from-everything link).
  email_paused       boolean not null default false,
  -- Secret in unsubscribe links, so people can opt out without signing in.
  unsubscribe_token  uuid not null unique default gen_random_uuid(),
  last_digest_at     timestamptz,
  updated_at         timestamptz not null default now(),
  constraint notification_settings_quiet_pair check ((quiet_start is null) = (quiet_end is null))
);
alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon;
revoke insert, update, delete on public.notification_settings from authenticated;
create policy "owner reads notification settings" on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()));

create table public.notification_preferences (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  type     text not null check (type = any (public.notification_types())),
  in_app   boolean not null,
  email    boolean not null,
  push     boolean not null,
  primary key (user_id, type)
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon;
revoke insert, update, delete on public.notification_preferences from authenticated;
create policy "owner reads notification preferences" on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

-- One person's setting for one type and channel, with defaults.
create or replace function public.notification_pref(p_user uuid, p_type text, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case p_channel when 'in_app' then p.in_app when 'email' then p.email when 'push' then p.push end
       from public.notification_preferences p where p.user_id = p_user and p.type = p_type),
    public.notification_default(p_type, p_channel));
$$;
revoke execute on function public.notification_pref(uuid, text, text) from public, anon, authenticated;

create or replace function public.ensure_notification_settings(p_user uuid)
returns public.notification_settings
language plpgsql
security definer
set search_path = ''
as $$
declare s public.notification_settings;
begin
  insert into public.notification_settings (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into s from public.notification_settings where user_id = p_user;
  return s;
end;
$$;
revoke execute on function public.ensure_notification_settings(uuid) from public, anon, authenticated;

-- Everything the settings page needs: each type with its three switches.
create or replace function public.my_notification_preferences()
returns table (type text, in_app boolean, email boolean, push boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t, public.notification_pref(auth.uid(), t, 'in_app'),
            public.notification_pref(auth.uid(), t, 'email'),
            public.notification_pref(auth.uid(), t, 'push')
    from unnest(public.notification_types()) with ordinality as x(t, n)
   where auth.uid() is not null
   order by n;
$$;
revoke execute on function public.my_notification_preferences() from public, anon;
grant execute on function public.my_notification_preferences() to authenticated;

-- Save the whole preferences grid: [{type, in_app, email, push}, ...].
-- weekly_digest only has email, so its in_app/push are stored as false.
create or replace function public.set_notification_preferences(p_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(p_prefs) <> 'array' or jsonb_array_length(p_prefs) > 20 then
    raise exception 'invalid preferences' using errcode = '22023';
  end if;
  for p in select * from jsonb_array_elements(p_prefs) loop
    if not (p->>'type' = any (public.notification_types())) then
      raise exception 'unknown notification type' using errcode = '22023';
    end if;
    insert into public.notification_preferences (user_id, type, in_app, email, push)
    values (uid, p->>'type',
            p->>'type' <> 'weekly_digest' and coalesce((p->>'in_app')::boolean, true),
            coalesce((p->>'email')::boolean, false),
            p->>'type' <> 'weekly_digest' and coalesce((p->>'push')::boolean, false))
    on conflict (user_id, type) do update
      set in_app = excluded.in_app, email = excluded.email, push = excluded.push;
  end loop;
end;
$$;
revoke execute on function public.set_notification_preferences(jsonb) from public, anon;
grant execute on function public.set_notification_preferences(jsonb) to authenticated;

-- Time zone, quiet hours and "pause all email" from the settings page.
create or replace function public.update_notification_settings(
  p_timezone text, p_quiet_start time, p_quiet_end time, p_email_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_timezone is not null and not public.is_valid_timezone(p_timezone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  if (p_quiet_start is null) <> (p_quiet_end is null) or p_quiet_start = p_quiet_end then
    raise exception 'quiet hours need a start and a different end' using errcode = '22023';
  end if;
  perform public.ensure_notification_settings(uid);
  update public.notification_settings
     set timezone = coalesce(p_timezone, timezone), quiet_start = p_quiet_start, quiet_end = p_quiet_end,
         email_paused = coalesce(p_email_paused, false), updated_at = now()
   where user_id = uid;
end;
$$;
revoke execute on function public.update_notification_settings(text, time, time, boolean) from public, anon;
grant execute on function public.update_notification_settings(text, time, time, boolean) to authenticated;

-- The browser reports its time zone once; only fills it in if we don't know it yet.
create or replace function public.sync_my_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_timezone is null or not public.is_valid_timezone(p_timezone) then return; end if;
  perform public.ensure_notification_settings(uid);
  update public.notification_settings set timezone = p_timezone, updated_at = now()
   where user_id = uid and timezone is null;
end;
$$;
revoke execute on function public.sync_my_timezone(text) from public, anon;
grant execute on function public.sync_my_timezone(text) to authenticated;

-- One-click unsubscribe from an email, no sign-in: the token is the key.
-- p_type null or 'all' pauses every email. Returns false for an unknown token.
create or replace function public.unsubscribe_email(p_token uuid, p_type text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid;
begin
  select user_id into uid from public.notification_settings where unsubscribe_token = p_token;
  if uid is null then return false; end if;
  if p_type is null or p_type = 'all' then
    update public.notification_settings set email_paused = true, updated_at = now() where user_id = uid;
  elsif p_type = any (public.notification_types()) then
    insert into public.notification_preferences (user_id, type, in_app, email, push)
    values (uid, p_type, public.notification_pref(uid, p_type, 'in_app'), false, public.notification_pref(uid, p_type, 'push'))
    on conflict (user_id, type) do update set email = false;
  else
    return false;
  end if;
  return true;
end;
$$;
revoke execute on function public.unsubscribe_email(uuid, text) from public;
grant execute on function public.unsubscribe_email(uuid, text) to anon, authenticated;

-- When quiet hours end for this person, if `p_at` falls inside them; else p_at.
create or replace function public.quiet_hours_end(p_user uuid, p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.notification_settings;
  tz text;
  local_ts timestamp;
  t time;
  end_local timestamp;
begin
  select * into s from public.notification_settings where user_id = p_user;
  if s.user_id is null or s.quiet_start is null then return p_at; end if;
  tz := coalesce(s.timezone, 'UTC');
  local_ts := p_at at time zone tz;
  t := local_ts::time;
  if s.quiet_start < s.quiet_end then
    if t >= s.quiet_start and t < s.quiet_end then end_local := local_ts::date + s.quiet_end; end if;
  else
    -- Wraps midnight, e.g. 22:00-07:00.
    if t >= s.quiet_start then end_local := (local_ts::date + 1) + s.quiet_end;
    elsif t < s.quiet_end then end_local := local_ts::date + s.quiet_end;
    end if;
  end if;
  if end_local is null then return p_at; end if;
  return end_local at time zone tz;
end;
$$;
revoke execute on function public.quiet_hours_end(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Push subscriptions
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh        text not null check (char_length(p256dh) <= 200),
  auth          text not null check (char_length(auth) <= 100),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
revoke insert, update, delete on public.push_subscriptions from authenticated;
create policy "owner reads push subscriptions" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Save this browser's subscription (re-saving moves an endpoint to the caller).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.push_subscriptions where user_id = uid and endpoint <> p_endpoint) >= 10 then
    -- Keep the newest ten devices.
    delete from public.push_subscriptions
     where id in (select id from public.push_subscriptions where user_id = uid order by created_at limit 1);
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications (in-app center)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type = any (public.notification_types()) and type <> 'weekly_digest'),
  -- Batches and de-duplicates: while unread, the same key bumps `count`.
  dedupe_key   text not null check (char_length(dedupe_key) <= 200),
  count        integer not null default 1 check (count >= 1),
  -- The most recent person behind it (sender, reactor, new match).
  actor_id     uuid references public.profiles (id) on delete set null,
  group_id     uuid references public.groups (id) on delete cascade,
  story_id     uuid references public.stories (id) on delete cascade,
  goal_id      uuid references public.goals (id) on delete cascade,
  -- The recipient's own bucket item (new match links to its matches page).
  item_id      uuid references public.bucket_items (id) on delete cascade,
  request_id   uuid references public.match_requests (id) on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  -- False when the person turned off in-app for this type (kept so email/push can render it).
  show_in_app  boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  read_at      timestamptz
);
create unique index notifications_unread_key on public.notifications (user_id, dedupe_key) where read_at is null;
create index notifications_user_idx on public.notifications (user_id, updated_at desc);
create index notifications_key_idx on public.notifications (user_id, dedupe_key);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
create policy "owner reads notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- The bell updates live.
alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- Outbox (server only)
-- ---------------------------------------------------------------------------
create table public.notification_deliveries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  notification_id  uuid references public.notifications (id) on delete cascade,  -- null for the digest
  type             text not null check (type = any (public.notification_types())),
  channel          text not null check (channel in ('email', 'push')),
  status           text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  not_before       timestamptz not null default now(),
  attempts         smallint not null default 0,
  last_error       text check (char_length(last_error) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create unique index notification_deliveries_one_open
  on public.notification_deliveries (notification_id, channel) where status in ('pending', 'sending');
create index notification_deliveries_due on public.notification_deliveries (not_before) where status = 'pending';
create index notification_deliveries_user_idx on public.notification_deliveries (user_id);
alter table public.notification_deliveries enable row level security;
-- No policies and no grants: only the secret key (service_role) touches it.
revoke all on public.notification_deliveries from anon, authenticated;

-- Queue email/push for a notification that was just created or bumped.
create or replace function public.queue_notification_deliveries(p_n public.notifications)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch text;
  due timestamptz;
  last_sent timestamptz;
begin
  foreach ch in array array['email', 'push'] loop
    continue when not public.notification_pref(p_n.user_id, p_n.type, ch);
    continue when ch = 'push' and not exists (select 1 from public.push_subscriptions where user_id = p_n.user_id);
    continue when ch = 'email' and exists (select 1 from public.notification_settings where user_id = p_n.user_id and email_paused);
    -- Already queued: it will carry the latest count when it goes.
    continue when exists (select 1 from public.notification_deliveries
                          where notification_id = p_n.id and channel = ch and status in ('pending', 'sending'));
    select max(sent_at) into last_sent from public.notification_deliveries
     where notification_id = p_n.id and channel = ch and status = 'sent';
    -- One email per unread batch; push at most once per window.
    continue when ch = 'email' and last_sent is not null;
    due := case when public.notification_is_batched(p_n.type)
                then greatest(p_n.created_at + public.notification_batch_window(),
                              coalesce(last_sent + public.notification_batch_window(), now()))
                else now() end;
    insert into public.notification_deliveries (user_id, notification_id, type, channel, not_before)
    values (p_n.user_id, p_n.id, p_n.type, ch, due)
    on conflict do nothing;
  end loop;
end;
$$;
revoke execute on function public.queue_notification_deliveries(public.notifications) from public, anon, authenticated;

-- Create or bump a notification. Skips notifying yourself and anyone blocked
-- either way. Called only from triggers and scheduled functions.
create or replace function public.notify(
  p_user uuid, p_type text, p_key text,
  p_actor uuid default null, p_group uuid default null, p_story uuid default null,
  p_goal uuid default null, p_item uuid default null, p_request uuid default null,
  p_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare n public.notifications;
begin
  if p_user is null or p_user = p_actor then return; end if;
  if p_actor is not null and public.is_blocked_between(p_actor, p_user) then return; end if;

  insert into public.notifications as x
    (user_id, type, dedupe_key, actor_id, group_id, story_id, goal_id, item_id, request_id, data, show_in_app)
  values (p_user, p_type, p_key, p_actor, p_group, p_story, p_goal, p_item, p_request, coalesce(p_data, '{}'::jsonb),
          public.notification_pref(p_user, p_type, 'in_app'))
  on conflict (user_id, dedupe_key) where read_at is null do update
    set count = x.count + 1,
        actor_id = coalesce(excluded.actor_id, x.actor_id),
        data = x.data || excluded.data,
        updated_at = now()
  returning * into n;

  perform public.queue_notification_deliveries(n);
end;
$$;
revoke execute on function public.notify(uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: events become notifications
-- ---------------------------------------------------------------------------

-- New match: someone added a goal you have. Tell the owners of matching items
-- the new item is visible to (same rules as matching), up to 200 of them.
-- Batched per goal, so a popular goal is one "3 new people want to ..." line.
create or replace function public.notify_new_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical uuid;
  r record;
begin
  if new.status = 'done' then return null; end if;
  select coalesce(g.merged_into_id, g.id) into canonical from public.goals g where g.id = new.goal_id;
  if canonical is null then return null; end if;
  for r in
    select distinct on (b.owner_id) b.owner_id, b.id as item_id
      from public.bucket_items b
      join public.goals g on g.id = b.goal_id
     where coalesce(g.merged_into_id, g.id) = canonical
       and b.owner_id <> new.owner_id
       and b.status <> 'done'
       and public.item_matchable_by(new, b.owner_id)
     order by b.owner_id, b.created_at
     limit 200
  loop
    perform public.notify(r.owner_id, 'new_match', 'new_match:' || canonical,
                          p_actor => new.owner_id, p_goal => canonical, p_item => r.item_id);
  end loop;
  return null;
end;
$$;
create trigger bucket_items_notify_new_match
  after insert on public.bucket_items
  for each row execute function public.notify_new_match();

-- Buddy request in; request accepted back to the sender. A declined or
-- cancelled request clears the recipient's notification.
create or replace function public.notify_match_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.recipient_id, 'buddy_request', 'buddy_request:' || new.id,
                          p_actor => new.sender_id, p_goal => new.goal_id, p_item => new.recipient_item_id, p_request => new.id);
  elsif new.status is distinct from old.status then
    update public.notifications set read_at = now()
     where user_id = new.recipient_id and dedupe_key = 'buddy_request:' || new.id and read_at is null;
    if new.status = 'accepted' then
      perform public.notify(new.sender_id, 'request_accepted', 'request_accepted:' || new.id,
                            p_actor => new.recipient_id, p_goal => new.goal_id, p_item => new.sender_item_id, p_request => new.id);
    end if;
  end if;
  return null;
end;
$$;
create trigger match_requests_notify
  after insert or update of status on public.match_requests
  for each row execute function public.notify_match_request();

-- Group chat: one batched notification per group per member.
create or replace function public.notify_group_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hidden_at is not null then return null; end if;
  perform public.notify(m.user_id, 'group_message', 'group_message:' || new.group_id,
                        p_actor => new.sender_id, p_group => new.group_id)
     from public.group_members m
    where m.group_id = new.group_id and m.user_id <> new.sender_id;
  return null;
end;
$$;
create trigger group_messages_notify
  after insert on public.group_messages
  for each row execute function public.notify_group_message();

-- New dates to vote on: everyone in the group but the proposer.
create or replace function public.notify_plan_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify(m.user_id, 'plan_vote', 'plan_vote:' || new.group_id,
                        p_actor => new.proposed_by, p_group => new.group_id)
     from public.group_members m
    where m.group_id = new.group_id and m.user_id <> new.proposed_by;
  return null;
end;
$$;
create trigger group_date_options_notify
  after insert on public.group_date_options
  for each row execute function public.notify_plan_vote();

-- Voting clears your "vote needed" for that group.
create or replace function public.clear_plan_vote_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n set read_at = now()
    from public.group_date_options o
   where o.id = new.option_id
     and n.user_id = new.user_id and n.dedupe_key = 'plan_vote:' || o.group_id and n.read_at is null;
  return null;
end;
$$;
create trigger group_date_votes_clear_notification
  after insert on public.group_date_votes
  for each row execute function public.clear_plan_vote_notification();

-- Reactions on your story, batched per story.
create or replace function public.notify_story_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare owner uuid;
begin
  select author_id into owner from public.stories where id = new.story_id;
  perform public.notify(owner, 'story_reaction', 'story_reaction:' || new.story_id,
                        p_actor => new.user_id, p_story => new.story_id);
  return null;
end;
$$;
create trigger story_reactions_notify
  after insert on public.story_reactions
  for each row execute function public.notify_story_reaction();

-- Opening a group's chat marks its message notification read (redefines 0007).
create or replace function public.mark_group_read(p_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.group_members set last_read_at = now() where group_id = p_group_id and user_id = auth.uid();
  update public.notifications set read_at = now()
   where user_id = auth.uid() and dedupe_key = 'group_message:' || p_group_id and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Notification center
-- ---------------------------------------------------------------------------
create or replace function public.my_notifications(
  p_locale text default 'en', p_limit integer default 30, p_before timestamptz default null)
returns table (
  id uuid, type text, count integer,
  actor_name text, actor_username text, actor_avatar text,
  group_id uuid, group_name text, goal_title text,
  story_id uuid, item_id uuid, request_id uuid,
  data jsonb, created_at timestamptz, updated_at timestamptz, read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.type, n.count,
         coalesce(a.display_name, a.username), a.username, a.avatar_url,
         n.group_id,
         -- Only show a group's name while you're still in it.
         case when public.group_has_member(n.group_id, n.user_id) then g.name end,
         public.goal_title(coalesce(n.goal_id, g.goal_id, s.goal_id), p_locale),
         n.story_id, n.item_id, n.request_id, n.data, n.created_at, n.updated_at, n.read_at
    from public.notifications n
    left join public.profiles a on a.id = n.actor_id
    left join public.groups g on g.id = n.group_id
    left join public.stories s on s.id = n.story_id
   where n.user_id = auth.uid() and n.show_in_app
     and (p_before is null or n.updated_at < p_before)
   order by n.updated_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
revoke execute on function public.my_notifications(text, integer, timestamptz) from public, anon;
grant execute on function public.my_notifications(text, integer, timestamptz) to authenticated;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.notifications
   where user_id = auth.uid() and read_at is null and show_in_app;
$$;
revoke execute on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated;

-- Mark some (or, with null, all) of your notifications read.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduled: date reminders and the weekly digest (called by the cron route)
-- ---------------------------------------------------------------------------

-- A week and a day before a group's leading date (most votes, then earliest),
-- for groups that are planning or confirmed. Each reminder goes out once.
create or replace function public.queue_date_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  sent integer := 0;
begin
  for r in
    with lead_opt as (
      select distinct on (o.group_id) o.group_id, o.id as option_id, o.starts_on
        from public.group_date_options o
        join public.groups g on g.id = o.group_id
       where g.status in ('planning', 'confirmed')
       order by o.group_id, (select count(*) from public.group_date_votes v where v.option_id = o.id) desc, o.starts_on
    )
    select l.*, m.user_id, (l.starts_on - (now() at time zone 'UTC')::date) as days
      from lead_opt l
      join public.group_members m on m.group_id = l.group_id
     where l.starts_on - (now() at time zone 'UTC')::date in (1, 7)
  loop
    continue when exists (select 1 from public.notifications
                          where user_id = r.user_id and dedupe_key = 'date_approaching:' || r.option_id || ':' || r.days);
    perform public.notify(r.user_id, 'date_approaching', 'date_approaching:' || r.option_id || ':' || r.days,
                          p_group => r.group_id,
                          p_data => jsonb_build_object('starts_on', r.starts_on, 'days', r.days));
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.queue_date_reminders() from public, anon, authenticated;

-- What goes in someone's weekly digest: up to 5 people who added one of your
-- goals this week (and can match with you), and up to 3 stories from the week
-- about your goals or by people you follow, most reacted first.
create or replace function public.digest_content(p_user uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with my_goals as (
    select distinct on (coalesce(g.merged_into_id, g.id)) coalesce(g.merged_into_id, g.id) as goal_id, b.id as my_item_id
      from public.bucket_items b join public.goals g on g.id = b.goal_id
     where b.owner_id = p_user and b.status <> 'done'
     order by coalesce(g.merged_into_id, g.id), b.created_at
  ),
  matches as (
    select distinct on (b.owner_id) b.owner_id, mg.goal_id, mg.my_item_id, b.created_at
      from public.bucket_items b
      join public.goals g on g.id = b.goal_id
      join my_goals mg on mg.goal_id = coalesce(g.merged_into_id, g.id)
     where b.created_at > now() - interval '7 days'
       and public.item_matchable_by(b, p_user)
     order by b.owner_id, b.created_at desc
  ),
  stories as (
    select s.id, s.author_id, s.goal_id, s.body, s.created_at,
           (select count(*) from public.story_reactions r where r.story_id = s.id) as reactions
      from public.stories s
     where s.created_at > now() - interval '7 days'
       and s.author_id <> p_user
       and not public.is_blocked_between(s.author_id, p_user)
       and (s.goal_id in (select goal_id from my_goals)
            or exists (select 1 from public.follows f where f.follower_id = p_user and f.followee_id = s.author_id))
  )
  select jsonb_build_object(
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(p.display_name, p.username),
               'goal', public.goal_title(m.goal_id, p_locale),
               'item_id', m.my_item_id) order by m.created_at desc)
        from (select * from matches order by created_at desc limit 5) m
        join public.profiles p on p.id = m.owner_id), '[]'::jsonb),
    'match_count', (select count(*) from matches),
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', st.id,
               'name', coalesce(p.display_name, p.username),
               'goal', public.goal_title(st.goal_id, p_locale),
               'caption', left(st.body, 160),
               'reactions', st.reactions) order by st.reactions desc, st.created_at desc)
        from (select * from stories order by reactions desc, created_at desc limit 3) st
        join public.profiles p on p.id = st.author_id), '[]'::jsonb));
$$;
revoke execute on function public.digest_content(uuid, text) from public, anon, authenticated;

-- Queue a digest for everyone for whom it's Monday 09:00 or later locally and
-- who hasn't had one in six days. Only people with an active item get one.
create or replace function public.queue_weekly_digests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  queued integer := 0;
begin
  for r in
    select p.id, coalesce(s.timezone, 'UTC') as tz
      from public.profiles p
      left join public.notification_settings s on s.user_id = p.id
     where p.onboarded_at is not null
       and coalesce(s.email_paused, false) = false
       and (s.last_digest_at is null or s.last_digest_at < now() - interval '6 days')
       and extract(isodow from now() at time zone coalesce(s.timezone, 'UTC')) = 1
       and (now() at time zone coalesce(s.timezone, 'UTC'))::time >= time '09:00'
       and public.notification_pref(p.id, 'weekly_digest', 'email')
       and exists (select 1 from public.bucket_items b where b.owner_id = p.id and b.status <> 'done')
     limit 1000
  loop
    perform public.ensure_notification_settings(r.id);
    update public.notification_settings set last_digest_at = now() where user_id = r.id;
    insert into public.notification_deliveries (user_id, type, channel) values (r.id, 'weekly_digest', 'email');
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;
revoke execute on function public.queue_weekly_digests() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sending (server only, called by /api/cron/notifications with the secret key)
-- ---------------------------------------------------------------------------

-- Claim due deliveries and return what the server needs to render and send
-- them. Re-checks preferences, read state and quiet hours at send time, so a
-- change made after queueing still counts.
create or replace function public.claim_notification_deliveries(p_limit integer default 50)
returns table (
  delivery_id uuid, channel text, type text, user_id uuid,
  email text, locale text, unsubscribe_token uuid,
  count integer, actor_name text, group_id uuid, group_name text, goal_title text,
  story_id uuid, item_id uuid, request_id uuid, data jsonb,
  push_subscriptions jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  d public.notification_deliveries;
  n public.notifications;
  quiet_end timestamptz;
  loc text;
  digest jsonb;
begin
  -- Rows stuck in 'sending' (a crashed run) go back in the queue.
  update public.notification_deliveries set status = 'pending', updated_at = now()
   where status = 'sending' and updated_at < now() - interval '10 minutes';

  for d in
    select * from public.notification_deliveries
     where status = 'pending' and not_before <= now()
     order by not_before
     limit least(greatest(coalesce(p_limit, 50), 1), 500)
     for update skip locked
  loop
    n := null;
    if d.notification_id is not null then
      select * into n from public.notifications where id = d.notification_id;
      if n.read_at is not null then
        update public.notification_deliveries set status = 'skipped', last_error = 'already read', updated_at = now() where id = d.id;
        continue;
      end if;
    end if;
    if not public.notification_pref(d.user_id, d.type, d.channel)
       or (d.channel = 'email' and exists (select 1 from public.notification_settings s where s.user_id = d.user_id and s.email_paused)) then
      update public.notification_deliveries set status = 'skipped', last_error = 'turned off', updated_at = now() where id = d.id;
      continue;
    end if;
    if d.channel = 'push' and not exists (select 1 from public.push_subscriptions s where s.user_id = d.user_id) then
      update public.notification_deliveries set status = 'skipped', last_error = 'no push subscription', updated_at = now() where id = d.id;
      continue;
    end if;
    quiet_end := public.quiet_hours_end(d.user_id, now());
    if quiet_end > now() then
      update public.notification_deliveries set not_before = quiet_end, updated_at = now() where id = d.id;
      continue;
    end if;

    select p.locale into loc from public.profiles p where p.id = d.user_id;
    digest := null;
    if d.type = 'weekly_digest' then
      digest := public.digest_content(d.user_id, coalesce(loc, 'en'));
      if jsonb_array_length(digest->'matches') = 0 and jsonb_array_length(digest->'stories') = 0 then
        update public.notification_deliveries set status = 'skipped', last_error = 'nothing new', updated_at = now() where id = d.id;
        continue;
      end if;
    end if;

    update public.notification_deliveries set status = 'sending', attempts = attempts + 1, updated_at = now() where id = d.id;

    delivery_id := d.id; channel := d.channel; type := d.type; user_id := d.user_id;
    locale := coalesce(loc, 'en');
    email := case when d.channel = 'email' then (select u.email from auth.users u where u.id = d.user_id) end;
    unsubscribe_token := case when d.channel = 'email' then (public.ensure_notification_settings(d.user_id)).unsubscribe_token end;
    count := coalesce(n.count, 1);
    actor_name := (select coalesce(p.display_name, p.username) from public.profiles p where p.id = n.actor_id);
    group_id := n.group_id;
    group_name := case when public.group_has_member(n.group_id, d.user_id) then (select g.name from public.groups g where g.id = n.group_id) end;
    goal_title := public.goal_title(coalesce(n.goal_id, (select g.goal_id from public.groups g where g.id = n.group_id),
                                             (select s.goal_id from public.stories s where s.id = n.story_id)), locale);
    story_id := n.story_id; item_id := n.item_id; request_id := n.request_id;
    data := coalesce(digest, n.data, '{}'::jsonb);
    push_subscriptions := case when d.channel = 'push' then
      (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
         from public.push_subscriptions s where s.user_id = d.user_id) end;
    return next;
  end loop;
end;
$$;
revoke execute on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;

-- Report how a delivery went. Failures retry up to 3 times (5, then 10
-- minutes later). Push endpoints the browser vendor says are gone are removed.
create or replace function public.finish_notification_delivery(
  p_delivery_id uuid, p_ok boolean, p_error text default null, p_expired_endpoints text[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare d public.notification_deliveries;
begin
  select * into d from public.notification_deliveries where id = p_delivery_id for update;
  if d.id is null then return; end if;
  if p_expired_endpoints is not null then
    delete from public.push_subscriptions where user_id = d.user_id and endpoint = any (p_expired_endpoints);
  end if;
  if p_ok then
    update public.notification_deliveries set status = 'sent', sent_at = now(), last_error = null, updated_at = now() where id = d.id;
    if d.channel = 'push' then
      update public.push_subscriptions set last_used_at = now() where user_id = d.user_id;
    end if;
  elsif d.attempts < 3 and p_error is distinct from 'not configured' then
    update public.notification_deliveries
       set status = 'pending', not_before = now() + d.attempts * interval '5 minutes',
           last_error = left(p_error, 500), updated_at = now()
     where id = d.id;
  else
    update public.notification_deliveries
       set status = case when p_error = 'not configured' then 'skipped' else 'failed' end,
           last_error = left(p_error, 500), updated_at = now()
     where id = d.id;
  end if;
end;
$$;
revoke execute on function public.finish_notification_delivery(uuid, boolean, text, text[]) from public, anon, authenticated;
grant execute on function public.finish_notification_delivery(uuid, boolean, text, text[]) to service_role;

-- One call for the cron route: queue scheduled notifications.
create or replace function public.queue_scheduled_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object('date_reminders', public.queue_date_reminders(),
                            'digests', public.queue_weekly_digests());
end;
$$;
revoke execute on function public.queue_scheduled_notifications() from public, anon, authenticated;
grant execute on function public.queue_scheduled_notifications() to service_role;

-- ---------------------------------------------------------------------------
-- Data export (adds to export_my_data from 0009; the app merges both)
-- ---------------------------------------------------------------------------
create or replace function public.export_my_notification_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'notification_settings', (select to_jsonb(s) - 'unsubscribe_token' from public.notification_settings s where s.user_id = auth.uid()),
    'notification_preferences', (select coalesce(jsonb_agg(to_jsonb(p) - 'user_id'), '[]'::jsonb)
                                   from public.my_notification_preferences() p),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n) - 'user_id' order by n.created_at), '[]'::jsonb)
                        from public.notifications n where n.user_id = auth.uid()),
    'push_devices', (select count(*) from public.push_subscriptions where user_id = auth.uid()))
  where auth.uid() is not null;
$$;
revoke execute on function public.export_my_notification_data() from public, anon;
grant execute on function public.export_my_notification_data() to authenticated;
