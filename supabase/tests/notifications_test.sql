-- =============================================================================
-- Notifications smoke test: triggers, batching, read state, preferences,
-- quiet hours, the email/push outbox, unsubscribe, date reminders, the weekly
-- digest content, export and who can see what. Rolls back. Local database only:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/notifications_test.sql
-- Success prints "ALL NOTIFICATION CHECKS PASSED".
-- =============================================================================
begin;

-- a1 Ama, b2 Bo, c3 Cara, d4 Dex (no goals)
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || k)::uuid, k || '@example.com',
       jsonb_build_object('display_name', n, 'adult_confirmed', true)
from (values ('a1','Ama'),('b2','Bo'),('c3','Cara'),('d4','Dex')) v(k, n);
update public.profiles set username = lower(display_name) || '_t', onboarded_at = now()
 where id::text like '00000000-0000-0000-0000-0000000000%';

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated, anon, service_role;
insert into ids values
  ('ama', '00000000-0000-0000-0000-0000000000a1'), ('bo', '00000000-0000-0000-0000-0000000000b2'),
  ('cara', '00000000-0000-0000-0000-0000000000c3'), ('dex', '00000000-0000-0000-0000-0000000000d4'),
  ('kili', (select id from public.goals where slug = 'climb-mount-kilimanjaro'));

-- ---------- New match: adding a goal someone has tells them, batched per goal ----------
with x as (
insert into public.bucket_items (owner_id, title, goal_id)
values ((select v from ids where k = 'ama'), 'Kilimanjaro', (select v from ids where k = 'kili'))
returning id)
insert into ids select 'ama_item', id from x;
do $$ begin
  assert (select count(*) from public.notifications) = 0, 'first person on a goal: nobody to tell';
end $$;
with x as (
insert into public.bucket_items (owner_id, title, goal_id)
values ((select v from ids where k = 'bo'), 'Kili', (select v from ids where k = 'kili'))
returning id)
insert into ids select 'bo_item', id from x;
insert into public.bucket_items (owner_id, title, goal_id)
values ((select v from ids where k = 'cara'), 'Kilimanjaro trek', (select v from ids where k = 'kili'));
do $$
declare n public.notifications;
begin
  select * into n from public.notifications where user_id = (select v from ids where k = 'ama') and type = 'new_match';
  assert n.count = 2, 'two new people, one notification with count 2';
  assert n.actor_id = (select v from ids where k = 'cara'), 'latest person is the actor';
  assert n.item_id = (select v from ids where k = 'ama_item'), 'links to my own item';
  assert (select count from public.notifications where user_id = (select v from ids where k = 'bo') and type = 'new_match') = 1, 'Bo hears about Cara';
  assert (select count(*) from public.notifications where user_id = (select v from ids where k = 'cara')) = 0, 'Cara added last: nothing for her';
  assert (select count(*) from public.notification_deliveries where type = 'new_match') = 0,
    'new match: email off by default and no push device yet';
end $$;

-- ---------- Buddy request in, accepted back out ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select public.send_match_request((select v from ids where k = 'bo_item'), (select v from ids where k = 'ama_item'), 'Climb in March?');
reset role;
do $$
declare n public.notifications;
begin
  select * into n from public.notifications where user_id = (select v from ids where k = 'ama') and type = 'buddy_request';
  assert n.id is not null and n.actor_id = (select v from ids where k = 'bo'), 'Ama gets the request';
  assert (select count(*) from public.notification_deliveries
           where notification_id = n.id and channel = 'email' and status = 'pending' and not_before <= now()) = 1,
    'request email queued right away';
  insert into ids values ('ama_request_note', n.id), ('request', n.request_id);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select public.respond_match_request((select v from ids where k = 'request'), true);
do $$ begin
  assert (select count(*) from public.notifications where type = 'request_accepted') = 0, 'RLS: Ama cannot see Bo''s notifications';
  assert (select read_at is not null from public.notifications where id = (select v from ids where k = 'ama_request_note')),
    'answering the request clears it';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications
           where user_id = (select v from ids where k = 'bo') and type = 'request_accepted' and actor_id = (select v from ids where k = 'ama')) = 1,
    'Bo hears Ama accepted';
end $$;

-- ---------- Group chat: batched per group, cleared by reading the chat ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into ids select 'group', public.create_group((select v from ids where k = 'kili'), 'Kili crew');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select public.join_group((select v from ids where k = 'group'));
select public.save_push_subscription('https://push.example.com/cara-phone', 'BKey', 'authsecret');
do $$ begin
  begin
    perform public.save_push_subscription('http://push.example.com/insecure', 'k', 'a');
    raise exception 'saved a non-https push endpoint';
  exception when check_violation then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select public.join_group((select v from ids where k = 'group'));
insert into public.group_messages (group_id, body) select v, 'Hi all' from ids where k = 'group';
insert into public.group_messages (group_id, body) select v, 'Who has boots?' from ids where k = 'group';
insert into public.group_messages (group_id, body) select v, 'March works for me' from ids where k = 'group';
reset role;
do $$
declare n public.notifications;
begin
  select * into n from public.notifications where user_id = (select v from ids where k = 'cara') and type = 'group_message';
  assert n.count = 3, 'three messages, one notification';
  assert (select count from public.notifications where user_id = (select v from ids where k = 'ama') and type = 'group_message') = 3, 'Ama too';
  assert (select count(*) from public.notifications where user_id = (select v from ids where k = 'bo') and type = 'group_message') = 0, 'not the sender';
  assert (select count(*) from public.notification_deliveries where notification_id = n.id) = 1, 'one push for the burst';
  assert (select not_before from public.notification_deliveries where notification_id = n.id) >= n.created_at + interval '9 minutes',
    'push waits for the batch window';
  assert (select count(*) from public.notification_deliveries d join public.notifications x on x.id = d.notification_id
           where x.user_id = (select v from ids where k = 'ama') and x.type = 'group_message') = 0,
    'Ama: chat email off by default, no push device';
  insert into ids values ('cara_chat_note', n.id);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$ begin
  assert public.unread_notification_count() = 1, 'Cara: just the chat';
end $$;
select public.mark_group_read((select v from ids where k = 'group'));
do $$ begin
  assert (select read_at is not null from public.notifications where id = (select v from ids where k = 'cara_chat_note')), 'opening the chat clears it';
  begin
    perform * from public.notification_deliveries;
    raise exception 'read the outbox';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.claim_notification_deliveries(10);
    raise exception 'claimed deliveries as a user';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- The batched push comes due, but Cara already read the chat: skipped.
update public.notification_deliveries set not_before = now() - interval '1 second'
 where notification_id = (select v from ids where k = 'cara_chat_note');
select count(*) from public.claim_notification_deliveries(50);
do $$ begin
  assert (select status = 'skipped' and last_error = 'already read' from public.notification_deliveries
           where notification_id = (select v from ids where k = 'cara_chat_note')), 'read before it went: skipped';
end $$;

-- A new message after reading starts a fresh notification.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
insert into public.group_messages (group_id, body) select v, 'Booked!' from ids where k = 'group';
reset role;
do $$ begin
  assert (select count(*) from public.notifications where user_id = (select v from ids where k = 'cara') and type = 'group_message') = 2,
    'new unread notification after reading';
end $$;

-- ---------- Plan vote needed, cleared by voting ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
with x as (
insert into public.group_date_options (group_id, starts_on, ends_on)
select v, current_date + 30, current_date + 37 from ids where k = 'group'
returning id)
insert into ids select 'option', id from x;
reset role;
do $$ begin
  assert (select count(*) from public.notifications where type = 'plan_vote') = 2, 'Bo and Cara asked to vote';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
insert into public.group_date_votes (option_id) select v from ids where k = 'option';
reset role;
do $$ begin
  assert (select read_at is not null from public.notifications where type = 'plan_vote' and user_id = (select v from ids where k = 'bo')), 'voting clears it';
  assert (select read_at is null from public.notifications where type = 'plan_vote' and user_id = (select v from ids where k = 'cara')), 'Cara still needs to vote';
end $$;

-- ---------- Story reactions, batched per story; blocked people can't reach you ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
insert into ids select 'story', public.create_story((select v from ids where k = 'kili'), 'Training hike done', null, 'Arusha', '{}', '{}'::uuid[]);
select public.block_user((select v from ids where k = 'dex'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
insert into public.story_reactions (story_id, kind) select v, 'love' from ids where k = 'story';
insert into public.story_reactions (story_id, kind) select v, 'fire' from ids where k = 'story';
reset role;
select public.notify((select v from ids where k = 'cara'), 'story_reaction', 'story_reaction:' || (select v from ids where k = 'story'),
                     p_actor => (select v from ids where k = 'dex'), p_story => (select v from ids where k = 'story'));
do $$ begin
  assert (select count from public.notifications where user_id = (select v from ids where k = 'cara') and type = 'story_reaction') = 2,
    'two reactions, one line; the blocked person adds nothing';
end $$;

-- ---------- Preferences and quiet hours ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$
declare p record;
begin
  assert (select count(*) from public.my_notification_preferences()) = 8, 'eight types';
  select * into p from public.my_notification_preferences() where type = 'buddy_request';
  assert p.in_app and p.email and p.push, 'request defaults: everything on';
  select * into p from public.my_notification_preferences() where type = 'weekly_digest';
  assert p.email and not p.in_app and not p.push, 'digest is email only';
  begin
    perform public.set_notification_preferences('[{"type":"nonsense","email":true}]');
    raise exception 'saved an unknown type';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.update_notification_settings('Mars/Olympus', null, null, false);
    raise exception 'saved an unknown time zone';
  exception when invalid_parameter_value then null;
  end;
end $$;
-- Bo: chat by email instead of in the app.
select public.set_notification_preferences('[{"type":"group_message","in_app":false,"email":true,"push":false}]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into public.group_messages (group_id, body) select v, 'Bo, check your email' from ids where k = 'group';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  assert (select show_in_app = false from public.notifications where type = 'group_message' and read_at is null), 'hidden from my center';
  assert public.unread_notification_count() = 2, 'new match and accepted request count; the hidden chat does not';
  assert (select count(*) from public.my_notifications('en', 30, null) where type = 'group_message') = 0, 'not listed';
end $$;
-- Quiet hours around right now (UTC), from an hour ago to an hour from now.
select public.update_notification_settings('UTC', ((now() at time zone 'UTC') - interval '1 hour')::time,
                                           ((now() at time zone 'UTC') + interval '1 hour')::time, false);
reset role;
do $$ begin
  assert public.quiet_hours_end((select v from ids where k = 'bo'), now()) between now() + interval '59 minutes' and now() + interval '61 minutes',
    'quiet until an hour from now';
end $$;
update public.notification_deliveries d set not_before = now() - interval '1 second'
  from public.notifications n
 where n.id = d.notification_id and n.user_id = (select v from ids where k = 'bo') and n.type = 'group_message';
do $$ begin
  assert (select count(*) from public.claim_notification_deliveries(50) c where c.user_id = (select v from ids where k = 'bo')) = 0,
    'nothing sent to Bo during quiet hours';
  assert (select d.not_before > now() + interval '59 minutes' from public.notification_deliveries d
           join public.notifications n on n.id = d.notification_id
          where n.user_id = (select v from ids where k = 'bo') and n.type = 'group_message'), 'pushed to the end of quiet hours';
end $$;
-- Overnight quiet hours in New York: 22:00-07:00.
update public.notification_settings set timezone = 'America/New_York', quiet_start = '22:00', quiet_end = '07:00'
 where user_id = (select v from ids where k = 'bo');
do $$ begin
  assert public.quiet_hours_end((select v from ids where k = 'bo'), '2027-01-15 04:00Z') = '2027-01-15 12:00Z', '23:00 NY waits until 07:00 NY';
  assert public.quiet_hours_end((select v from ids where k = 'bo'), '2027-01-15 11:00Z') = '2027-01-15 12:00Z', '06:00 NY waits an hour';
  assert public.quiet_hours_end((select v from ids where k = 'bo'), '2027-01-15 15:00Z') = '2027-01-15 15:00Z', '10:00 NY goes now';
end $$;

-- ---------- Sending: claim, finish, retry ----------
-- Bo's "request accepted" email was claimed by an earlier run above; put it back and lift quiet hours.
update public.notification_settings set quiet_start = null, quiet_end = null where user_id = (select v from ids where k = 'bo');
update public.notification_deliveries set status = 'pending', not_before = now() - interval '1 second'
 where type = 'request_accepted' and channel = 'email';
do $$
declare c record;
begin
  select * into c from public.claim_notification_deliveries(50) where type = 'request_accepted';
  assert c.email = 'b2@example.com' and c.channel = 'email', 'server gets the address to send to';
  assert c.actor_name = 'Ama' and c.unsubscribe_token is not null and c.goal_title is not null, 'and what to say';
  perform public.finish_notification_delivery(c.delivery_id, true);
  assert (select status from public.notification_deliveries where id = c.delivery_id) = 'sent', 'marked sent';
end $$;
-- A failure retries later; "not configured" stops quietly.
with x as (
insert into public.notification_deliveries (user_id, type, channel) select v, 'request_accepted', 'push' from ids where k = 'cara'
returning id)
insert into ids select 'retry', id from x;
update public.notification_deliveries set attempts = 1, status = 'sending' where id = (select v from ids where k = 'retry');
select public.finish_notification_delivery((select v from ids where k = 'retry'), false, 'push service said 500', array['https://push.example.com/cara-phone']);
do $$ begin
  assert (select status = 'pending' and not_before > now() from public.notification_deliveries where id = (select v from ids where k = 'retry')), 'retries later';
  assert (select count(*) from public.push_subscriptions where user_id = (select v from ids where k = 'cara')) = 0, 'expired device removed';
end $$;
select public.finish_notification_delivery((select v from ids where k = 'retry'), false, 'not configured');
do $$ begin
  assert (select status from public.notification_deliveries where id = (select v from ids where k = 'retry')) = 'skipped', 'unconfigured channel skipped';
end $$;

-- ---------- Unsubscribe links work signed out ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare token uuid;
begin
  begin
    perform * from public.my_notifications('en', 10, null);
    raise exception 'anon listed notifications';
  exception when insufficient_privilege then null;
  end;
  assert not public.unsubscribe_email(gen_random_uuid(), 'buddy_request'), 'unknown token does nothing';
end $$;
reset role;
select (public.ensure_notification_settings((select v from ids where k = 'ama'))).unsubscribe_token as token \gset
set local role anon;
select public.unsubscribe_email(:'token', 'buddy_request');
reset role;
do $$ begin
  assert not public.notification_pref((select v from ids where k = 'ama'), 'buddy_request', 'email'), 'request emails off';
  assert public.notification_pref((select v from ids where k = 'ama'), 'buddy_request', 'in_app'), 'in-app untouched';
end $$;
set local role anon;
select public.unsubscribe_email(:'token', 'all');
reset role;
do $$ begin
  assert (select email_paused from public.notification_settings where user_id = (select v from ids where k = 'ama')), 'all email paused';
end $$;

-- ---------- Date reminders: a week and a day before, once each ----------
update public.group_date_options set starts_on = current_date + 7, ends_on = current_date + 14 where id = (select v from ids where k = 'option');
update public.groups set status = 'planning' where id = (select v from ids where k = 'group');
do $$ begin
  assert public.queue_date_reminders() = 3, 'every member reminded';
  update public.notifications set read_at = now() where type = 'date_approaching';
  assert public.queue_date_reminders() = 0, 'not again, even after reading';
  assert (select (data->>'days')::int from public.notifications where type = 'date_approaching' limit 1) = 7, 'says how many days';
end $$;

-- ---------- Weekly digest content ----------
do $$
declare d jsonb;
begin
  d := public.digest_content((select v from ids where k = 'ama'), 'en');
  assert (d->>'match_count')::int = 2, 'Bo and Cara joined Ama''s goal this week';
  assert d->'matches'->0->>'item_id' = (select v from ids where k = 'ama_item')::text, 'links to my matches';
  assert jsonb_array_length(d->'stories') = 1 and d->'stories'->0->>'name' = 'Cara', 'Cara''s story about my goal';
  d := public.digest_content((select v from ids where k = 'dex'), 'en');
  assert jsonb_array_length(d->'matches') = 0 and jsonb_array_length(d->'stories') = 0, 'Dex: nothing';
  assert jsonb_typeof(public.queue_scheduled_notifications()) = 'object', 'scheduler callable';
end $$;
insert into public.notification_deliveries (user_id, type, channel) select v, 'weekly_digest', 'email' from ids where k in ('bo', 'dex');
update public.notification_settings set quiet_start = null, quiet_end = null where user_id = (select v from ids where k = 'bo');
do $$
declare c record;
begin
  select * into c from public.claim_notification_deliveries(50) where type = 'weekly_digest';
  assert c.user_id = (select v from ids where k = 'bo') and jsonb_array_length(c.data->'matches') = 2, 'Bo''s digest has Ama and Cara';
  assert (select status from public.notification_deliveries d where d.type = 'weekly_digest' and d.user_id = (select v from ids where k = 'dex')) = 'skipped',
    'empty digest not sent';
end $$;

-- ---------- Center, export ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare e jsonb;
begin
  assert (select count(*) from public.my_notifications('en', 30, null)) >= 3, 'Ama''s center has entries';
  assert (select group_name from public.my_notifications('en', 30, null) where type = 'group_message' limit 1) = 'Kili crew', 'group name shown to members';
  perform public.mark_notifications_read(null);
  assert public.unread_notification_count() = 0, 'mark all read';
  e := public.export_my_notification_data();
  assert jsonb_array_length(e->'notifications') >= 3 and not (e->'notification_settings' ? 'unsubscribe_token'), 'export without the secret token';
  assert (select count(*) from public.notification_settings) = 1, 'only my settings visible';
end $$;
reset role;

select 'ALL NOTIFICATION CHECKS PASSED' as result;
rollback;
