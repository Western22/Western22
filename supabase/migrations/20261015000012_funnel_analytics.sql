-- =============================================================================
-- Funnel analytics, kept in our own database (no third-party tracker).
--
-- Six steps, recorded once per person, the first time it happens:
--   signup → first_item → first_match_request → group_joined → goal_completed → story_posted
--
-- Recorded by database triggers, so every path (web, future mobile app, admin
-- tools) is counted, nobody can fake or skip an event from the browser, and
-- there is no extra request from the client. Only the person's id, the step and
-- the time are stored: no content, location, email or device data.
--
-- Demo accounts (seed script, user_metadata.demo = true) are never recorded.
-- Rows disappear with the account (on delete cascade).
-- Only moderators can read the numbers, through funnel_report().
-- =============================================================================

create table public.funnel_events (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  step        text not null check (step in (
                'signup', 'first_item', 'first_match_request',
                'group_joined', 'goal_completed', 'story_posted')),
  occurred_at timestamptz not null default now(),
  primary key (user_id, step)
);

comment on table public.funnel_events is
  'First time each person reached each funnel step. Written only by triggers; read via funnel_report().';

create index funnel_events_step_time_idx on public.funnel_events (step, occurred_at);

alter table public.funnel_events enable row level security;

-- Moderators may read raw rows (e.g. for SQL exports); nobody writes directly.
create policy "Moderators read funnel events"
  on public.funnel_events for select to authenticated
  using ((select public.is_moderator()));

revoke all on public.funnel_events from anon, authenticated;
grant select on public.funnel_events to authenticated;

-- -----------------------------------------------------------------------------
-- The single tracking function every trigger calls.
-- -----------------------------------------------------------------------------
create or replace function public.record_funnel_step(p_user_id uuid, p_step text, p_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;
  -- Demo accounts never count.
  if exists (
    select 1 from auth.users u
    where u.id = p_user_id and coalesce(u.raw_user_meta_data ->> 'demo', '') = 'true'
  ) then
    return;
  end if;
  insert into public.funnel_events (user_id, step, occurred_at)
  values (p_user_id, p_step, coalesce(p_at, now()))
  on conflict (user_id, step) do nothing;
end;
$$;

revoke all on function public.record_funnel_step(uuid, text, timestamptz) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create or replace function public.funnel_on_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.record_funnel_step(new.id, 'signup', new.created_at);
  return null;
end; $$;

create or replace function public.funnel_on_bucket_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_funnel_step(new.owner_id, 'first_item', new.created_at);
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    perform public.record_funnel_step(new.owner_id, 'goal_completed', new.completed_at);
  end if;
  return null;
end; $$;

create or replace function public.funnel_on_match_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.record_funnel_step(new.sender_id, 'first_match_request', new.created_at);
  return null;
end; $$;

create or replace function public.funnel_on_group_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.record_funnel_step(new.user_id, 'group_joined', new.joined_at);
  return null;
end; $$;

create or replace function public.funnel_on_story() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.record_funnel_step(new.author_id, 'story_posted', new.created_at);
  return null;
end; $$;

revoke all on function public.funnel_on_profile() from public, anon, authenticated;
revoke all on function public.funnel_on_bucket_item() from public, anon, authenticated;
revoke all on function public.funnel_on_match_request() from public, anon, authenticated;
revoke all on function public.funnel_on_group_member() from public, anon, authenticated;
revoke all on function public.funnel_on_story() from public, anon, authenticated;

create trigger funnel_signup after insert on public.profiles
  for each row execute function public.funnel_on_profile();
create trigger funnel_bucket_item after insert or update of status on public.bucket_items
  for each row execute function public.funnel_on_bucket_item();
create trigger funnel_match_request after insert on public.match_requests
  for each row execute function public.funnel_on_match_request();
create trigger funnel_group_member after insert on public.group_members
  for each row execute function public.funnel_on_group_member();
create trigger funnel_story after insert on public.stories
  for each row execute function public.funnel_on_story();

-- -----------------------------------------------------------------------------
-- Backfill from what already happened (skips demo accounts via the function).
-- -----------------------------------------------------------------------------
select public.record_funnel_step(id, 'signup', created_at) from public.profiles;
select public.record_funnel_step(owner_id, 'first_item', min(created_at)) from public.bucket_items group by owner_id;
select public.record_funnel_step(owner_id, 'goal_completed', min(completed_at))
  from public.bucket_items where status = 'done' group by owner_id;
select public.record_funnel_step(sender_id, 'first_match_request', min(created_at)) from public.match_requests group by sender_id;
select public.record_funnel_step(user_id, 'group_joined', min(joined_at)) from public.group_members group by user_id;
select public.record_funnel_step(author_id, 'story_posted', min(created_at)) from public.stories group by author_id;

-- -----------------------------------------------------------------------------
-- Report: of the people who signed up in [p_from, p_to), how many reached each
-- step (at any time so far). Moderators only.
-- -----------------------------------------------------------------------------
create or replace function public.funnel_report(p_from timestamptz, p_to timestamptz)
returns table (step text, step_order int, people bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_moderator() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with steps(step, step_order) as (
    values ('signup', 1), ('first_item', 2), ('first_match_request', 3),
           ('group_joined', 4), ('goal_completed', 5), ('story_posted', 6)
  ),
  cohort as (
    select e.user_id from public.funnel_events e
    where e.step = 'signup' and e.occurred_at >= p_from and e.occurred_at < p_to
  )
  select s.step, s.step_order, count(e.user_id)
  from steps s
  left join public.funnel_events e
    on e.step = s.step and e.user_id in (select c.user_id from cohort c)
  group by s.step, s.step_order
  order by s.step_order;
end;
$$;

revoke all on function public.funnel_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.funnel_report(timestamptz, timestamptz) to authenticated;
