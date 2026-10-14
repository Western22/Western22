-- =============================================================================
-- Trust and safety smoke test: phone verification, reports, text moderation,
-- rate limits, the moderation queue and actions, suspensions, privacy
-- settings, safety tips, plan sharing, data export and account deletion.
-- Rolls back. Local database only:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/trust_safety_test.sql
-- Success prints "ALL TRUST AND SAFETY CHECKS PASSED".
-- =============================================================================
begin;

-- a1 Ama (group owner), b2 Bo (causes trouble), c3 Cara (member), d4 Dex (outsider), f6 Mo (moderator)
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || k)::uuid, k || '@example.com',
       jsonb_build_object('display_name', n, 'adult_confirmed', true)
from (values ('a1','Ama'),('b2','Bo'),('c3','Cara'),('d4','Dex'),('f6','Mo')) v(k, n);
update public.profiles set username = lower(display_name) || '_t', onboarded_at = now()
 where id::text like '00000000-0000-0000-0000-0000000000%';
insert into public.moderators values ('00000000-0000-0000-0000-0000000000f6');
insert into public.bucket_items (owner_id, title, goal_id)
select p.id, g.slug, g.id from public.goals g, public.profiles p
 where g.slug = 'climb-mount-kilimanjaro' and p.id::text like '00000000-0000-0000-0000-0000000000%';

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated, anon;

-- ---------- Phone verification mirrors Supabase Auth; clients can't fake it ----------
update auth.users set phone = '15555550100', phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select phone_verified_at is not null from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'phone verified';
end $$;
update auth.users set phone = null, phone_confirmed_at = null where id = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select phone_verified_at is null from public.profiles where id = '00000000-0000-0000-0000-0000000000c3'), 'no phone, no badge';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$ begin
  begin
    update public.profiles set phone_verified_at = now() where id = auth.uid();
    raise exception 'set my own verification';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_id_verified(auth.uid(), true);
    raise exception 'called the ID provider hook';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.account_status) = 0 and (select count(*) from public.profile_settings) = 0, 'private tables empty for me';
end $$;

-- ---------- A group: Ama owns it, Bo and Cara join ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into ids select 'group', public.create_group((select id from public.goals where slug = 'climb-mount-kilimanjaro'), 'Safe crew');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select public.join_group((select v from ids where k = 'group'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select public.join_group((select v from ids where k = 'group'));

-- ---------- Text moderation: threats are blocked, scam lines are flagged ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  begin
    insert into public.group_messages (group_id, body) values ((select v from ids where k = 'group'), 'Leave or I WILL KILL YOU');
    raise exception 'threat was posted';
  exception when check_violation then null;
  end;
end $$;
insert into public.group_messages (group_id, body) values ((select v from ids where k = 'group'), 'Pay the deposit by Western Union to me');
insert into ids select 'scam_msg', id from public.group_messages where body like 'Pay the deposit%';
insert into public.group_messages (group_id, body) values ((select v from ids where k = 'group'), 'Boots are 50% off, link in bio');
insert into ids select 'spam_msg', id from public.group_messages where body like 'Boots%';
select public.flag_my_content('message', (select v from ids where k = 'spam_msg'), '{spam}');
select public.flag_my_content('message', (select v from ids where k = 'scam_msg'), '{scam}');  -- already flagged by the term list
do $$ begin
  begin
    perform public.flag_my_content('group', (select v from ids where k = 'group'), '{spam}');  -- Ama's group, not Bo's
    raise exception 'flagged someone else''s content';
  exception when invalid_parameter_value then null;
  end;
  assert (select count(*) from public.reports) = 0, 'auto flags are not visible to the author';
end $$;

-- ---------- Reports ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select public.report_content('message', (select v from ids where k = 'scam_msg'), 'scam', 'Asked me for money');
select public.report_content('message', (select v from ids where k = 'scam_msg'), 'spam');  -- once per person
select public.report_content('user', '00000000-0000-0000-0000-0000000000b2', 'scam');
select public.report_content('group', (select v from ids where k = 'group'), 'other');
do $$ begin
  assert (select count(*) from public.reports) = 3, 'I see my 3 reports';
  begin
    perform public.report_content('user', auth.uid(), 'spam');
    raise exception 'reported myself';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.report_content('user', '00000000-0000-0000-0000-0000000000b2', 'auto');
    raise exception 'pretended to be the auto-moderator';
  exception when invalid_parameter_value then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.report_content('message', (select v from ids where k = 'scam_msg'), 'spam');
    raise exception 'reported a message I cannot see';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.moderation_queue();
    raise exception 'non-moderator read the queue';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.reports) = 0, 'reported person sees no reports about them';
end $$;

-- ---------- Rate limit: 20 messages a minute ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$ begin
  for i in 1..20 loop
    insert into public.group_messages (group_id, body) values ((select v from ids where k = 'group'), 'msg ' || i);
  end loop;
  begin
    insert into public.group_messages (group_id, body) values ((select v from ids where k = 'group'), 'one too many');
    raise exception 'message rate limit not enforced';
  exception when program_limit_exceeded then null;
  end;
end $$;

-- ---------- Moderation queue and actions ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f6","role":"authenticated"}', true);
do $$
declare
  q record;
begin
  select * into q from public.moderation_queue() where target_id = (select v from ids where k = 'scam_msg');
  assert q.report_count = 2 and q.auto_flagged and q.target_username = 'bo_t', 'scam message: auto flag plus Cara''s report';
  assert q.preview like 'Pay the deposit%' and 'scam' = any(q.reasons), 'preview and reasons';
  assert exists (select 1 from public.moderation_queue() where target_id = (select v from ids where k = 'spam_msg') and auto_flagged),
         'provider flag in the queue';
  assert (select count(*) from public.moderation_queue()) = 4, 'four targets: 2 messages, Bo, the group';

  -- Dismiss the group report; remove the scam message; warn and suspend Bo.
  perform public.moderate('group', (select v from ids where k = 'group'), 'dismiss');
  perform public.moderate('message', (select v from ids where k = 'scam_msg'), 'remove', 'Scam');
  assert (select public.moderate('user', '00000000-0000-0000-0000-0000000000b2', 'warn', 'Do not ask members for money.'))
         = '00000000-0000-0000-0000-0000000000b2', 'moderate returns the person';
  perform public.moderate('message', (select v from ids where k = 'spam_msg'), 'suspend', 'Repeated scams', 7);
  assert (select count(*) from public.moderation_queue()) = 0, 'queue cleared';
  assert (select count(*) from public.moderation_queue('dismissed')) = 1, 'dismissed list';
  assert (select snapshot from public.moderation_actions where action = 'remove') like 'Pay the deposit%', 'log keeps a snapshot';
  assert (select count(*) from public.moderation_actions) = 4, 'every action logged';
  begin
    perform public.moderate('user', auth.uid(), 'suspend');
    raise exception 'suspended myself';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Suspended: can read, can't write, out of matching; sees the notices ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$
declare w uuid;
begin
  begin
    insert into public.group_messages (group_id, body) values ((select v from ids where k = 'group'), 'hello?');
    raise exception 'suspended person posted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.follows (follower_id, followee_id) values (auth.uid(), '00000000-0000-0000-0000-0000000000a1');
    raise exception 'suspended person followed';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.group_messages where group_id = (select v from ids where k = 'group')) > 0, 'can still read';
  assert (select count(*) from public.my_account_notices() where suspended_until > now() + interval '6 days') = 1, 'sees suspension';
  select warning_id into w from public.my_account_notices() where warning_id is not null;
  assert w is not null, 'sees warning';
  perform public.acknowledge_warning(w);
  assert not exists (select 1 from public.my_account_notices() where warning_id is not null), 'warning acknowledged';
end $$;
reset role;
do $$ begin
  assert (select hidden_at is not null from public.group_messages where id = (select v from ids where k = 'scam_msg')), 'message removed';
  assert not public.item_matchable_by((select b from public.bucket_items b where owner_id = '00000000-0000-0000-0000-0000000000b2'),
                                      '00000000-0000-0000-0000-0000000000a1'), 'suspended person not matchable';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f6","role":"authenticated"}', true);
select public.moderate('user', '00000000-0000-0000-0000-0000000000b2', 'unsuspend');
reset role;
do $$ begin
  assert not public.is_suspended('00000000-0000-0000-0000-0000000000b2'), 'unsuspended';
end $$;

-- ---------- Privacy: hide from matching, approximate location ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select public.set_my_location(5.6037, -0.1870);
select public.update_privacy_settings(true, true);
reset role;
do $$
declare lat double precision;
begin
  assert not public.item_matchable_by((select b from public.bucket_items b where owner_id = '00000000-0000-0000-0000-0000000000c3'),
                                      '00000000-0000-0000-0000-0000000000a1'), 'hidden from matching';
  assert public.item_matchable_by((select b from public.bucket_items b where owner_id = '00000000-0000-0000-0000-0000000000a1'),
                                  '00000000-0000-0000-0000-0000000000c3'), 'others still matchable';
  select extensions.st_y(location::extensions.geometry) into lat from public.profile_locations where user_id = '00000000-0000-0000-0000-0000000000c3';
  assert abs(lat / 0.225 - round(lat / 0.225)) < 1e-9, 'location coarsened to the ~25 km grid; got ' || lat;
end $$;

-- ---------- Safety tips and sharing a plan ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select public.acknowledge_safety_tips();
select public.update_group_plan((select v from ids where k = 'group'), 'Moshi, Tanzania', null, 'USD', null);
insert into ids select 'share', public.create_plan_share((select v from ids where k = 'group'), 'Mum', 7);
do $$ begin
  assert (select safety_tips_seen_at is not null from public.profile_settings where user_id = auth.uid()), 'tips acknowledged';
  assert (select count(*) from public.plan_shares) = 1, 'I see my share';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.create_plan_share((select v from ids where k = 'group'), 'Friend');
    raise exception 'outsider shared a plan';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.plan_shares) = 0, 'shares are private';
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare p record;
begin
  select * into p from public.shared_plan((select v from ids where k = 'share'));
  assert p.group_name = 'Safe crew' and p.location = 'Moshi, Tanzania' and p.sharer_name = 'Ama', 'contact sees the plan';
  assert cardinality(p.members) = 3, 'contact sees who is going';
  assert (select count(*) from public.shared_plan(gen_random_uuid())) = 0, 'unknown link shows nothing';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select public.revoke_plan_share((select v from ids where k = 'share'));
do $$ begin
  assert (select count(*) from public.shared_plan((select v from ids where k = 'share'))) = 0, 'revoked link shows nothing';
end $$;

-- ---------- Export and account deletion ----------
do $$
declare d jsonb := public.export_my_data();
begin
  assert d -> 'account' ->> 'email' = 'a1@example.com', 'export has my email';
  assert jsonb_array_length(d -> 'bucket_items') = 1 and jsonb_array_length(d -> 'plan_shares') = 1, 'export has my items and shares';
  assert jsonb_array_length(d -> 'messages') = 0, 'export has only my own messages';
end $$;
select * from public.prepare_account_deletion();
do $$ begin
  assert not exists (select 1 from public.group_members where user_id = auth.uid()), 'left every group';
  assert (select owner_id from public.groups where id = (select v from ids where k = 'group')) = '00000000-0000-0000-0000-0000000000b2',
         'longest-standing member owns the group now';
end $$;
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'profile deleted';
  assert not exists (select 1 from public.bucket_items where owner_id = '00000000-0000-0000-0000-0000000000a1'), 'items deleted';
  assert exists (select 1 from public.groups where id = (select v from ids where k = 'group')), 'the group survives';
end $$;

-- ---------- Signed out ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin
    perform public.report_content('user', '00000000-0000-0000-0000-0000000000b2', 'spam');
    raise exception 'anon reported';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.reports;
    raise exception 'anon read reports';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'ALL TRUST AND SAFETY CHECKS PASSED' as result;
rollback;
