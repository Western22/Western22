-- =============================================================================
-- Groups smoke test: creation, joining, plan, chat, reports, completion.
-- Runs inside one transaction and rolls back. Local database only:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/groups_test.sql
-- Success prints "ALL GROUP CHECKS PASSED".
-- =============================================================================
begin;

-- o1 Ola (owner), a2 Ama, b3 Ben, c4 Cy (outsider), d5 Dan (blocked by Ola), e6 Eve (not onboarded)
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || k)::uuid, k || '@example.com',
       jsonb_build_object('display_name', n, 'adult_confirmed', true)
from (values ('01','Ola'),('a2','Ama'),('b3','Ben'),('c4','Cy'),('d5','Dan'),('e6','Eve')) v(k, n);
update public.profiles set username = lower(display_name) || '_g',
       onboarded_at = case when display_name = 'Eve' then null else now() end
 where id::text like '00000000-0000-0000-0000-0000000000%';
insert into public.blocks values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d5');
-- Ama already has the goal on her list (dreaming); Ben doesn't.
insert into public.bucket_items (owner_id, title, goal_id, visibility)
values ('00000000-0000-0000-0000-0000000000a2', 'Kilimanjaro!', (select id from public.goals where slug = 'climb-mount-kilimanjaro'), 'private');

set local role authenticated;

-- ---------- Ola creates a group ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'group', public.create_group(
  (select id from public.goals where slug = 'climb-mount-kilimanjaro'), '  Kili 2027  ', 'Machame route', 3, 'open');

do $$
declare g uuid := (select v from ids where k = 'group');
begin
  assert (select name || member_count || max_size || status from public.groups where id = g) = 'Kili 202713forming', 'group created';
  assert (select role from public.group_members where group_id = g and user_id = auth.uid()) = 'owner', 'creator is owner';
  assert exists (select 1 from public.bucket_items b join public.goals gl on gl.id = b.goal_id
                 where b.owner_id = auth.uid() and gl.slug = 'climb-mount-kilimanjaro'), 'goal added to owner''s list';
  begin
    perform public.create_group((select id from public.goals where slug = 'climb-mount-kilimanjaro'), 'x', null, 50, 'open');
    raise exception 'max size 50 accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.groups (goal_id, owner_id, name) values ((select goal_id from public.groups where id = g), auth.uid(), 'direct');
    raise exception 'direct group insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Ama and Ben join; the group fills up ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  assert public.join_group((select v from ids where k = 'group')) = 'joined', 'open group joined';
  assert (select count(*) from public.bucket_items where owner_id = auth.uid()) = 1, 'existing item kept, not duplicated';
  assert (select count(*) from public.group_members) = 2, 'members see each other';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
do $$ begin
  assert public.join_group((select v from ids where k = 'group')) = 'joined', 'ben joined';
  assert (select count(*) from public.bucket_items where owner_id = auth.uid()) = 1, 'goal added to ben''s list';
end $$;

-- ---------- Outsiders ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
do $$
declare g uuid := (select v from ids where k = 'group');
begin
  assert exists (select 1 from public.groups where id = g), 'outsiders can see the group listing';
  assert (select member_count from public.goal_groups((select goal_id from public.groups where id = g))) = 3, 'goal_groups count';
  assert (select count(*) from public.group_members) = 0, 'outsiders can''t see members';
  assert (select count(*) from public.group_messages) = 0, 'outsiders can''t see messages';
  begin
    perform public.join_group(g);
    raise exception 'joined a full group';
  exception when program_limit_exceeded then null;
  end;
  begin
    insert into public.group_messages (group_id, body) values (g, 'let me in');
    raise exception 'outsider posted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.group_checklist_items (group_id, title) values (g, 'sneaky');
    raise exception 'outsider edited checklist';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e6","role":"authenticated"}', true);
do $$ begin
  perform public.create_group((select id from public.goals where slug = 'climb-mount-kilimanjaro'), 'mine');
  raise exception 'not-onboarded user created a group';
exception when insufficient_privilege then null;
end $$;

-- ---------- Ola makes it request-only with room for more ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare g uuid := (select v from ids where k = 'group');
begin
  begin
    perform public.update_group(g, 'Kili 2027', null, 2, 'request');
    raise exception 'shrunk below member count';
  exception when invalid_parameter_value then null;
  end;
  perform public.update_group(g, 'Kili 2027', 'Machame route', 6, 'request');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
do $$ begin
  assert public.join_group((select v from ids where k = 'group'), 'I have gear!') = 'requested', 'request recorded';
  assert (select count(*) from public.group_join_requests) = 1, 'requester sees own request';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d5","role":"authenticated"}', true);
do $$ begin
  assert not exists (select 1 from public.goal_groups((select goal_id from public.groups where id = (select v from ids where k = 'group')))),
         'blocked person does not see the group';
  perform public.join_group((select v from ids where k = 'group'));
  raise exception 'blocked person joined';
exception when invalid_parameter_value then null;
end $$;

-- Ama (not owner) can't answer; Ola accepts.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.group_join_requests) = 0, 'members don''t see join requests';
  perform public.respond_join_request((select id from public.group_join_requests limit 1), true);
  raise exception 'unreachable';
exception when others then
  if sqlerrm = 'unreachable' then raise; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert (select note from public.group_join_requests) = 'I have gear!', 'owner sees the request';
  perform public.respond_join_request((select id from public.group_join_requests), true);
  assert (select member_count from public.groups) = 4, 'cy joined';
end $$;

-- ---------- Plan, votes, checklist ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
declare g uuid := (select v from ids where k = 'group'); opt uuid;
begin
  perform public.update_group_plan(g, 'Moshi, Tanzania', 2500, 'usd', 'Fly into JRO');
  assert (select location_text || budget_amount || budget_currency from public.group_plans) = 'Moshi, Tanzania2500USD', 'plan saved';
  insert into public.group_date_options (group_id, starts_on, ends_on) values (g, '2027-01-10', '2027-01-18') returning id into opt;
  insert into public.group_date_votes (option_id) values (opt);
  insert into public.group_checklist_items (group_id, title, category) values (g, 'Tanzania e-visa', 'visa');
  begin
    update public.group_checklist_items set done_by = '00000000-0000-0000-0000-000000000001';
    raise exception 'client set done_by';
  exception when insufficient_privilege then null;
  end;
  update public.group_checklist_items set done = true;
  assert (select done_by from public.group_checklist_items) = auth.uid(), 'done_by recorded by the database, not the client';
  begin
    insert into public.group_date_options (group_id, starts_on, ends_on) values (g, '2027-02-10', '2027-02-01');
    raise exception 'end before start accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.set_group_status(g, 'planning');
    raise exception 'member changed status';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Chat, read receipts, reports ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
do $$
declare g uuid := (select v from ids where k = 'group');
begin
  insert into public.group_messages (group_id, body) values (g, 'Who has a tent?');
  begin
    insert into public.group_messages (group_id, image_path) values (g, 'some-other-group/photo.jpg');
    raise exception 'photo outside the group folder accepted';
  exception when check_violation then null;
  end;
  insert into public.group_messages (group_id, image_path) values (g, g::text || '/tent.jpg');
  insert into public.group_messages (group_id, body) values (g, 'buy cheap pills');
  begin
    insert into public.group_messages (group_id, sender_id, body) values (g, '00000000-0000-0000-0000-0000000000a2', 'impersonation');
    raise exception 'sent as someone else';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Everything in this test shares one now(), so backdate when members last read.
reset role;
update public.group_members set last_read_at = now() - interval '1 minute';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
declare g uuid := (select v from ids where k = 'group');
begin
  assert (select unread_count from public.my_groups()) = 3, 'three unread';
  perform public.mark_group_read(g);
  assert (select unread_count from public.my_groups()) = 0, 'read';
  perform public.report_message((select id from public.group_messages where body = 'buy cheap pills'), 'spam');
  perform public.report_message((select id from public.group_messages where body = 'buy cheap pills'), 'spam');  -- once per person
  assert (select count(*) from public.message_reports) = 1, 'one report per person';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin perform public.report_message((select id from public.group_messages where body = 'buy cheap pills'), 'spam'); end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
do $$ begin
  perform public.report_message((select id from public.group_messages where body = 'buy cheap pills'), 'harassment');
  assert not exists (select 1 from public.group_messages where body = 'buy cheap pills'), 'three reports hide the message';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
do $$ begin
  assert exists (select 1 from public.group_messages where body = 'buy cheap pills'), 'sender still sees the hidden message';
  begin
    perform public.report_message((select id from public.group_messages where body = 'Who has a tent?'), 'spam');
    raise exception 'reported own message';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---------- Completion ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare g uuid := (select v from ids where k = 'group');
begin
  perform public.set_group_status(g, 'confirmed');
  perform public.set_group_status(g, 'completed');
  begin
    perform public.set_group_status(g, 'planning');
    raise exception 'reopened a completed group';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.bucket_items b join public.goals g on g.id = b.goal_id
          where g.slug = 'climb-mount-kilimanjaro' and b.status = 'done' and b.completed_at is not null) = 4,
         'every member''s item is done';
  assert (select bool_and(story_prompt) from public.group_members), 'every member is prompted for a story';
end $$;
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$
declare g uuid := (select v from ids where k = 'group');
begin
  insert into public.stories (goal_id, group_id, body)
  values ((select goal_id from public.groups where id = g), g, 'We made it to Uhuru Peak!');
  assert not (select story_prompt from public.my_groups()), 'posting a story clears the prompt';
  begin
    insert into public.stories (goal_id, body, photo_url)
    values ((select goal_id from public.groups where id = g), 'x', 'https://evil.example/photo.jpg');
    raise exception 'foreign photo url accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.join_group(g);  -- already a member: fine
    perform 1;
  end;
end $$;

-- Owner leaves: ownership passes to the longest-standing member (Ama).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin perform public.leave_group((select v from ids where k = 'group')); end $$;
reset role;
do $$ begin
  assert (select owner_id from public.groups) = '00000000-0000-0000-0000-0000000000a2', 'ownership transferred';
  assert (select role from public.group_members where user_id = '00000000-0000-0000-0000-0000000000a2') = 'owner', 'new owner role';
  assert (select member_count from public.groups) = 3, 'count updated';
end $$;

-- ---------- Signed out ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  assert (select count(*) from public.groups) = 1, 'anon sees group listings';
  assert (select count(*) from public.stories) = 1, 'stories are public';
  assert (select count(*) from public.goal_groups((select goal_id from public.groups))) = 1, 'anon can list goal groups';
  begin
    perform 1 from public.group_messages;
    raise exception 'anon read messages';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.join_group((select id from public.groups));
    raise exception 'anon joined';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'ALL GROUP CHECKS PASSED' as result;
rollback;
