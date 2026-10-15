-- =============================================================================
-- Funnel analytics smoke test (migration 0012): each step recorded once by
-- triggers, demo accounts skipped, only moderators can read. Rolls back.
-- Success prints "ALL ANALYTICS CHECKS PASSED".
-- =============================================================================
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.com', '{"display_name":"Ana","adult_confirmed":true}'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@example.com', '{"display_name":"Ben","adult_confirmed":true}'),
  ('00000000-0000-0000-0000-0000000000d3', 'demo@demo.invalid', '{"display_name":"Demo","adult_confirmed":true,"demo":true}');

do $$ begin
  assert (select count(*) from public.funnel_events where step = 'signup'
          and user_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2')) = 2,
    'signup recorded for real people';
  assert not exists (select 1 from public.funnel_events where user_id = '00000000-0000-0000-0000-0000000000d3'),
    'demo account not recorded';
end $$;

-- Ana walks the whole funnel (as the service would; triggers fire either way).
create temp table g on commit drop as select id from public.goals where status = 'active' order by id limit 1;
create temp table g2 on commit drop as select id from public.goals where status = 'active' order by id offset 1 limit 1;

insert into public.bucket_items (id, owner_id, title, goal_id) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1', 'Test', (select id from g)),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000a1', 'Second', (select id from g2)),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000d3', 'Demo item', (select id from g2));
insert into public.match_requests (goal_id, sender_id, recipient_id)
  values ((select id from g), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2');
insert into public.groups (id, goal_id, owner_id, name)
  values ('00000000-0000-0000-0000-00000000e001', (select id from g), '00000000-0000-0000-0000-0000000000a1', 'Crew');
insert into public.group_members (group_id, user_id, role)
  values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', 'owner')
  on conflict do nothing;
update public.bucket_items set status = 'done' where id = '00000000-0000-0000-0000-00000000c001';
update public.bucket_items set status = 'done' where id = '00000000-0000-0000-0000-00000000c002';
insert into public.stories (author_id, goal_id, body)
  values ('00000000-0000-0000-0000-0000000000a1', (select id from g), 'We did it.');

do $$ begin
  assert (select count(*) from public.funnel_events where user_id = '00000000-0000-0000-0000-0000000000a1') = 6,
    'all six steps recorded for Ana, got ' || (select count(*) from public.funnel_events where user_id = '00000000-0000-0000-0000-0000000000a1');
  assert (select count(*) from public.funnel_events where user_id = '00000000-0000-0000-0000-0000000000b2') = 1,
    'Ben only signed up (receiving a request is not his step)';
  assert not exists (select 1 from public.funnel_events where user_id = '00000000-0000-0000-0000-0000000000d3'),
    'demo activity not recorded';
end $$;

-- ---------- Ordinary people: cannot read, write or run the report ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.funnel_events) = 0, 'people cannot read funnel rows, even their own';
  begin
    insert into public.funnel_events (user_id, step) values (auth.uid(), 'story_posted');
    assert false, 'direct insert should fail';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.funnel_report(now() - interval '1 day', now() + interval '1 day');
    assert false, 'report should be refused';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_funnel_step(auth.uid(), 'story_posted');
    assert false, 'tracking function is not callable by people';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Moderators: report counts the signup cohort ----------
insert into public.moderators (user_id) values ('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$
declare
  r record;
  got jsonb := '{}';
begin
  for r in select * from public.funnel_report(now() - interval '1 minute', now() + interval '1 minute') loop
    got := got || jsonb_build_object(r.step, r.people);
  end loop;
  assert (got ->> 'signup')::int = 2, 'two signups in the window: ' || got::text;
  assert (got ->> 'story_posted')::int = 1, 'one story poster: ' || got::text;
  assert (got ->> 'first_match_request')::int = 1, 'one requester: ' || got::text;
  assert (select count(*) from public.funnel_report(now() - interval '1 minute', now() + interval '1 minute')) = 6, 'six steps';
  assert (select people from public.funnel_report(now() - interval '10 days', now() - interval '9 days') where step = 'signup') = 0,
    'empty window has zero signups';
end $$;
reset role;

select 'ALL ANALYTICS CHECKS PASSED' as result;
rollback;
