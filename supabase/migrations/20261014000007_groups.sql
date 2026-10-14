-- =============================================================================
-- 0007 · Groups: a small group forms around one goal, plans it together
-- (dates with votes, location, budget, checklist, status), chats in real time
-- (photos, read receipts, reports) and, when done, everyone's item is marked
-- done and members are prompted to post a story.
--
-- Most writes go through SECURITY DEFINER RPCs that check membership and
-- roles. Plan details (date options, votes, checklist) are written directly
-- under RLS, members only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid not null references public.goals (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  description   text check (char_length(description) <= 500),
  max_size      smallint not null default 6 check (max_size between 2 and 20),
  join_policy   text not null default 'open' check (join_policy in ('open', 'request')),
  status        text not null default 'forming'
                check (status in ('forming', 'planning', 'confirmed', 'completed')),
  member_count  smallint not null default 0,  -- kept in sync by a trigger on group_members
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint groups_completed_consistent check ((status = 'completed') = (completed_at is not null))
);
create index groups_goal_idx on public.groups (goal_id, status, created_at desc);
create index groups_owner_idx on public.groups (owner_id);

create table public.group_members (
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  -- Read receipts: everything sent up to this moment has been seen.
  last_read_at  timestamptz not null default now(),
  -- Set when the group completes its goal; cleared when the member posts a story or dismisses it.
  story_prompt  boolean not null default false,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
-- One owner per group.
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';

-- Membership checks. SECURITY DEFINER so policies on group_members can use
-- them without recursing into themselves. Clients only get the one-argument
-- form, about themselves, so nobody can probe other people's memberships.
create or replace function public.group_has_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id);
$$;
revoke execute on function public.group_has_member(uuid, uuid) from public, anon, authenticated;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.group_has_member(p_group_id, auth.uid());
$$;
grant execute on function public.is_group_member(uuid) to anon, authenticated;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid() and role = 'owner');
$$;
grant execute on function public.is_group_owner(uuid) to anon, authenticated;

-- Keep groups.member_count in sync.
create or replace function public.sync_group_member_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.groups g
     set member_count = (select count(*) from public.group_members m where m.group_id = g.id)
   where g.id = coalesce(new.group_id, old.group_id);
  return null;
end;
$$;
create trigger group_members_count after insert or delete on public.group_members
  for each row execute function public.sync_group_member_count();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
revoke insert, update, delete on public.groups, public.group_members from anon, authenticated;

-- Groups on live goals are listed publicly (name, size, status) so people can find them.
create policy "groups are listed" on public.groups for select to anon, authenticated
  using (
    exists (select 1 from public.goals g where g.id = goal_id and g.status in ('active', 'merged'))
    or public.is_group_member(id)
  );
create policy "members see each other" on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- Join requests (for groups that ask to join)
-- ---------------------------------------------------------------------------
create table public.group_join_requests (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  note          text check (char_length(note) <= 280),
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint group_join_requests_responded check ((status = 'pending') = (responded_at is null))
);
create unique index group_join_requests_one_pending on public.group_join_requests (group_id, user_id) where status = 'pending';
create index group_join_requests_user_idx on public.group_join_requests (user_id, created_at desc);

alter table public.group_join_requests enable row level security;
revoke all on public.group_join_requests from anon;
revoke insert, update, delete on public.group_join_requests from authenticated;
create policy "requester and owner see join requests" on public.group_join_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_group_owner(group_id));

-- ---------------------------------------------------------------------------
-- Plan: one row per group, plus date options with votes and a checklist.
-- ---------------------------------------------------------------------------
create table public.group_plans (
  group_id         uuid primary key references public.groups (id) on delete cascade,
  location_text    text check (char_length(location_text) <= 120),
  budget_amount    integer check (budget_amount between 0 and 10000000),  -- per person, whole units
  budget_currency  text not null default 'USD' check (budget_currency ~ '^[A-Z]{3}$'),
  notes            text check (char_length(notes) <= 1000),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id) on delete set null
);
alter table public.group_plans enable row level security;
revoke all on public.group_plans from anon;
revoke insert, update, delete on public.group_plans from authenticated;
create policy "members read the plan" on public.group_plans for select to authenticated
  using (public.is_group_member(group_id));

create table public.group_date_options (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  proposed_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  starts_on    date not null,
  ends_on      date not null,
  created_at   timestamptz not null default now(),
  constraint group_date_options_order check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index group_date_options_group_idx on public.group_date_options (group_id, starts_on);

create table public.group_date_votes (
  option_id   uuid not null references public.group_date_options (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (option_id, user_id)
);

create table public.group_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  category    text not null default 'other' check (category in ('visa', 'gear', 'booking', 'other')),
  done        boolean not null default false,
  done_by     uuid references public.profiles (id) on delete set null,
  done_at     timestamptz,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index group_checklist_group_idx on public.group_checklist_items (group_id, created_at);

-- Who ticked an item is recorded by the database, not the client.
create or replace function public.stamp_checklist_done()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_by := auth.uid();
    new.done_at := now();
  elsif not new.done then
    new.done_by := null;
    new.done_at := null;
  end if;
  return new;
end;
$$;
create trigger group_checklist_stamp before insert or update on public.group_checklist_items
  for each row execute function public.stamp_checklist_done();

alter table public.group_date_options enable row level security;
alter table public.group_date_votes enable row level security;
alter table public.group_checklist_items enable row level security;
revoke all on public.group_date_options, public.group_date_votes, public.group_checklist_items from anon;
revoke update on public.group_date_options, public.group_date_votes from authenticated;
revoke update on public.group_checklist_items from authenticated;
grant update (title, category, done) on public.group_checklist_items to authenticated;

create policy "members read date options" on public.group_date_options for select to authenticated
  using (public.is_group_member(group_id));
create policy "members propose dates" on public.group_date_options for insert to authenticated
  with check (proposed_by = (select auth.uid()) and public.is_group_member(group_id));
create policy "proposer or owner removes dates" on public.group_date_options for delete to authenticated
  using (proposed_by = (select auth.uid()) or public.is_group_owner(group_id));

create policy "members read votes" on public.group_date_votes for select to authenticated
  using (exists (select 1 from public.group_date_options o where o.id = option_id and public.is_group_member(o.group_id)));
create policy "members vote as themselves" on public.group_date_votes for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.group_date_options o where o.id = option_id and public.is_group_member(o.group_id)));
create policy "members remove own votes" on public.group_date_votes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "members read checklist" on public.group_checklist_items for select to authenticated
  using (public.is_group_member(group_id));
create policy "members add checklist items" on public.group_checklist_items for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id));
create policy "members tick checklist items" on public.group_checklist_items for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "creator or owner removes checklist items" on public.group_checklist_items for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_owner(group_id));

-- ---------------------------------------------------------------------------
-- Chat. Photos live in the private group-media bucket under {group_id}/.
-- A message reported by 3 different members is hidden from everyone but its
-- sender and moderators until reviewed.
-- ---------------------------------------------------------------------------
create table public.group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  sender_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text check (char_length(body) <= 2000),
  image_path  text check (char_length(image_path) <= 200),
  created_at  timestamptz not null default now(),
  hidden_at   timestamptz,
  constraint group_messages_has_content check (coalesce(char_length(trim(body)), 0) > 0 or image_path is not null),
  -- The photo must be inside this group's folder.
  constraint group_messages_image_in_group check (image_path is null or image_path like group_id::text || '/%')
);
create index group_messages_group_idx on public.group_messages (group_id, created_at desc);

alter table public.group_messages enable row level security;
revoke all on public.group_messages from anon;
revoke update, delete on public.group_messages from authenticated;
create policy "members read messages" on public.group_messages for select to authenticated
  using (public.is_group_member(group_id)
         and (hidden_at is null or sender_id = (select auth.uid()) or (select public.is_moderator())));
create policy "members send messages as themselves" on public.group_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and hidden_at is null and public.is_group_member(group_id));

create table public.message_reports (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.group_messages (id) on delete cascade,
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reason       text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  details      text check (char_length(details) <= 500),
  created_at   timestamptz not null default now(),
  unique (message_id, reporter_id)
);
alter table public.message_reports enable row level security;
revoke all on public.message_reports from anon;
revoke insert, update, delete on public.message_reports from authenticated;
-- TODO(moderation): a review screen for moderators (unhide or remove reported messages).
create policy "reporters and moderators see reports" on public.message_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_moderator()));

-- Realtime: new messages, and member rows for read receipts. Realtime applies
-- the select policies above, so only members receive a group's events.
alter publication supabase_realtime add table public.group_messages, public.group_members;

-- ---------------------------------------------------------------------------
-- Stories: what someone did, optionally with a photo, tied to a goal (and the
-- group they did it with). Public, shown on goal pages and in Memories.
-- ---------------------------------------------------------------------------
create table public.stories (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  goal_id     uuid not null references public.goals (id) on delete cascade,
  group_id    uuid references public.groups (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 2000),
  photo_url   text check (char_length(photo_url) <= 2048),
  created_at  timestamptz not null default now()
);
create index stories_goal_idx on public.stories (goal_id, created_at desc);
create index stories_group_idx on public.stories (group_id, created_at desc);

alter table public.stories enable row level security;
revoke update on public.stories from anon, authenticated;
revoke insert, delete on public.stories from anon;
create policy "stories are public" on public.stories for select to anon, authenticated using (true);
create policy "authors post stories" on public.stories for insert to authenticated
  with check (author_id = (select auth.uid())
              and (group_id is null or public.is_group_member(group_id))
              -- Photos only from the author's own folder in the stories bucket.
              and (photo_url is null or photo_url like '%/storage/v1/object/public/stories/' || (select auth.uid())::text || '/%'));
create policy "authors delete stories" on public.stories for delete to authenticated
  using (author_id = (select auth.uid()));

-- Posting a story for a group clears that member's prompt.
create or replace function public.clear_story_prompt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_id is not null then
    update public.group_members set story_prompt = false where group_id = new.group_id and user_id = new.author_id;
  end if;
  return null;
end;
$$;
create trigger stories_clear_prompt after insert on public.stories
  for each row execute function public.clear_story_prompt();

-- ---------------------------------------------------------------------------
-- Storage: private group-media (members only, under {group_id}/), public
-- stories (each author writes in their own folder). Photos are resized and
-- re-encoded in the browser, which strips EXIF/GPS.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-media', 'group-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
       ('stories', 'stories', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Group id from a storage path, or null if the first folder isn't a uuid.
create or replace function public.group_id_from_path(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (storage.foldername(p_name))[1]::uuid end;
$$;

create policy "group members read group media" on storage.objects for select to authenticated
  using (bucket_id = 'group-media' and public.is_group_member(public.group_id_from_path(name)));
create policy "group members upload group media" on storage.objects for insert to authenticated
  with check (bucket_id = 'group-media' and public.is_group_member(public.group_id_from_path(name)));

create policy "story authors upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'stories' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "story authors read own folder" on storage.objects for select to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "story authors delete own files" on storage.objects for delete to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Make sure a user has an item for a goal (joining a group puts the goal on
-- your list). Never changes an existing item.
create or replace function public.ensure_goal_item(p_user_id uuid, p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare loc text;
begin
  if exists (select 1 from public.bucket_items b join public.goals g on g.id = b.goal_id
             where b.owner_id = p_user_id and coalesce(g.merged_into_id, g.id) = p_goal_id) then
    return;
  end if;
  select locale into loc from public.profiles where id = p_user_id;
  insert into public.bucket_items (owner_id, title, goal_id, locale)
  values (p_user_id, public.goal_title(p_goal_id, coalesce(loc, 'en')), p_goal_id, coalesce(loc, 'en'))
  on conflict do nothing;
end;
$$;
revoke execute on function public.ensure_goal_item(uuid, uuid) from public, anon, authenticated;

create or replace function public.require_onboarded()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = uid and onboarded_at is not null and adult_confirmed_at is not null) then
    raise exception 'finish onboarding first' using errcode = '42501';
  end if;
  return uid;
end;
$$;
revoke execute on function public.require_onboarded() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_group: the caller becomes the owner; the goal goes on their list.
-- ---------------------------------------------------------------------------
create or replace function public.create_group(
  p_goal_id uuid,
  p_name text,
  p_description text default null,
  p_max_size int default 6,
  p_join_policy text default 'open'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_onboarded();
  goal uuid;
  new_id uuid;
begin
  select coalesce(merged_into_id, id) into goal from public.goals where id = p_goal_id and status in ('active', 'merged');
  if goal is null then raise exception 'goal not found' using errcode = '22023'; end if;
  if p_join_policy not in ('open', 'request') or p_max_size not between 2 and 20 then
    raise exception 'invalid group settings' using errcode = '22023';
  end if;
  if (select count(*) from public.groups where owner_id = uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many groups today' using errcode = '54000';
  end if;

  insert into public.groups (goal_id, owner_id, name, description, max_size, join_policy)
  values (goal, uid, trim(p_name), nullif(trim(p_description), ''), p_max_size, p_join_policy)
  returning id into new_id;
  insert into public.group_members (group_id, user_id, role) values (new_id, uid, 'owner');
  insert into public.group_plans (group_id, updated_by) values (new_id, uid);
  perform public.ensure_goal_item(uid, goal);
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_group: open groups add you straight away ('joined'); others record a
-- request for the owner ('requested').
-- ---------------------------------------------------------------------------
create or replace function public.join_group(p_group_id uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.require_onboarded();
  grp public.groups;
begin
  select * into grp from public.groups where id = p_group_id for update;
  if grp.id is null or public.is_blocked_between(grp.owner_id, uid) then
    raise exception 'group not found' using errcode = '22023';
  end if;
  if public.group_has_member(grp.id, uid) then return 'joined'; end if;
  if grp.status = 'completed' then raise exception 'group is closed' using errcode = '22023'; end if;
  if grp.member_count >= grp.max_size then raise exception 'group is full' using errcode = '54000'; end if;
  if char_length(trim(p_note)) > 280 then raise exception 'note too long' using errcode = '22023'; end if;

  if grp.join_policy = 'open' then
    insert into public.group_members (group_id, user_id) values (grp.id, uid);
    perform public.ensure_goal_item(uid, grp.goal_id);
    return 'joined';
  end if;

  if exists (select 1 from public.group_join_requests where group_id = grp.id and user_id = uid and status = 'pending') then
    return 'requested';
  end if;
  if (select count(*) from public.group_join_requests where user_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many requests today' using errcode = '54000';
  end if;
  insert into public.group_join_requests (group_id, user_id, note) values (grp.id, uid, nullif(trim(p_note), ''));
  return 'requested';
end;
$$;

create or replace function public.cancel_join_request(p_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.group_join_requests set status = 'cancelled', responded_at = now()
   where group_id = p_group_id and user_id = auth.uid() and status = 'pending';
$$;

-- The owner accepts (if there's room) or declines a join request.
create or replace function public.respond_join_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  req public.group_join_requests;
  grp public.groups;
begin
  select * into req from public.group_join_requests where id = p_request_id and status = 'pending' for update;
  if req.id is null then raise exception 'request not found' using errcode = '22023'; end if;
  select * into grp from public.groups where id = req.group_id for update;
  if grp.owner_id is distinct from uid then raise exception 'request not found' using errcode = '22023'; end if;

  if p_accept then
    if grp.status = 'completed' then raise exception 'group is closed' using errcode = '22023'; end if;
    if grp.member_count >= grp.max_size then raise exception 'group is full' using errcode = '54000'; end if;
    insert into public.group_members (group_id, user_id) values (grp.id, req.user_id) on conflict do nothing;
    perform public.ensure_goal_item(req.user_id, grp.goal_id);
  end if;
  update public.group_join_requests
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = req.id;
end;
$$;

-- Leave a group. If the owner leaves, the longest-standing member takes over;
-- if nobody is left, the group is deleted.
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  was_owner boolean;
  heir uuid;
begin
  delete from public.group_members where group_id = p_group_id and user_id = uid returning role = 'owner' into was_owner;
  if was_owner is null then raise exception 'not a member' using errcode = '22023'; end if;
  if was_owner then
    select user_id into heir from public.group_members where group_id = p_group_id order by joined_at limit 1;
    if heir is null then
      delete from public.groups where id = p_group_id;
    else
      update public.group_members set role = 'owner' where group_id = p_group_id and user_id = heir;
      update public.groups set owner_id = heir, updated_at = now() where id = p_group_id;
    end if;
  end if;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) or p_user_id = auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

-- Owner edits the group's name, description, size and how people join.
create or replace function public.update_group(
  p_group_id uuid, p_name text, p_description text, p_max_size int, p_join_policy text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare grp public.groups;
begin
  select * into grp from public.groups where id = p_group_id for update;
  if grp.id is null or not public.is_group_owner(p_group_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_join_policy not in ('open', 'request') or p_max_size not between greatest(2, grp.member_count) and 20 then
    raise exception 'invalid group settings' using errcode = '22023';
  end if;
  update public.groups
     set name = trim(p_name), description = nullif(trim(p_description), ''), max_size = p_max_size,
         join_policy = p_join_policy, updated_at = now()
   where id = p_group_id;
end;
$$;

-- Any member edits the plan's location, budget and notes.
create or replace function public.update_group_plan(
  p_group_id uuid, p_location text, p_budget_amount int, p_budget_currency text, p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_member(p_group_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.group_plans
     set location_text = nullif(trim(p_location), ''), budget_amount = p_budget_amount,
         budget_currency = upper(coalesce(nullif(trim(p_budget_currency), ''), 'USD')),
         notes = nullif(trim(p_notes), ''), updated_at = now(), updated_by = auth.uid()
   where group_id = p_group_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_group_status: owner moves forming / planning / confirmed freely.
-- 'completed' is final: every member's item for the goal is marked done
-- (added if missing) and every member is prompted to post a story.
-- ---------------------------------------------------------------------------
create or replace function public.set_group_status(p_group_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare grp public.groups;
begin
  select * into grp from public.groups where id = p_group_id for update;
  if grp.id is null or not public.is_group_owner(p_group_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('forming', 'planning', 'confirmed', 'completed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if grp.status = 'completed' then raise exception 'group already completed' using errcode = '22023'; end if;

  update public.groups
     set status = p_status, updated_at = now(),
         completed_at = case when p_status = 'completed' then now() end
   where id = p_group_id;

  if p_status = 'completed' then
    perform public.ensure_goal_item(m.user_id, grp.goal_id) from public.group_members m where m.group_id = p_group_id;
    update public.bucket_items b
       set status = 'done', completed_at = now(), updated_at = now()
      from public.goals g
     where g.id = b.goal_id and coalesce(g.merged_into_id, g.id) = grp.goal_id
       and b.status <> 'done'
       and b.owner_id in (select user_id from public.group_members where group_id = p_group_id);
    update public.group_members set story_prompt = true where group_id = p_group_id;
  end if;
end;
$$;

create or replace function public.dismiss_story_prompt(p_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.group_members set story_prompt = false where group_id = p_group_id and user_id = auth.uid();
$$;

-- Read receipts: the caller has seen everything up to now.
create or replace function public.mark_group_read(p_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.group_members set last_read_at = now() where group_id = p_group_id and user_id = auth.uid();
$$;

-- Report a message in a group you're in. Three reports hide it.
create or replace function public.report_message(p_message_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  msg public.group_messages;
begin
  select * into msg from public.group_messages where id = p_message_id;
  if msg.id is null or not public.group_has_member(msg.group_id, uid) or msg.sender_id = uid then
    raise exception 'message not found' using errcode = '22023';
  end if;
  insert into public.message_reports (message_id, reporter_id, reason, details)
  values (msg.id, uid, p_reason, nullif(trim(p_details), ''))
  on conflict (message_id, reporter_id) do nothing;
  if (select count(*) from public.message_reports where message_id = msg.id) >= 3 then
    update public.group_messages set hidden_at = coalesce(hidden_at, now()) where id = msg.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read models
-- ---------------------------------------------------------------------------

-- Groups for a goal page: open ones first, with the caller's relationship.
create or replace function public.goal_groups(p_goal_id uuid)
returns table (
  id uuid, name text, description text, status text, join_policy text,
  member_count int, max_size int, owner_display_name text, owner_username text,
  is_member boolean, request_pending boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, g.description, g.status, g.join_policy, g.member_count, g.max_size,
         p.display_name, p.username,
         public.is_group_member(g.id),
         exists (select 1 from public.group_join_requests r where r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending')
  from public.groups g
  join public.goals goal on goal.id = g.goal_id and goal.status in ('active', 'merged')
  join public.profiles p on p.id = g.owner_id
  where g.goal_id = (select coalesce(merged_into_id, id) from public.goals where id = p_goal_id)
    and (auth.uid() is null or not public.is_blocked_between(g.owner_id, auth.uid()))
  order by (g.status <> 'completed' and g.member_count < g.max_size) desc, g.created_at desc
  limit 50;
$$;

-- The caller's groups with unread counts.
create or replace function public.my_groups(p_locale text default 'en')
returns table (
  id uuid, name text, status text, member_count int, max_size int,
  goal_slug text, goal_title text, unread_count int, story_prompt boolean, pending_requests int
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, g.status, g.member_count, g.max_size,
         goal.slug, public.goal_title(goal.id, p_locale),
         (select count(*)::int from public.group_messages msg
           where msg.group_id = g.id and msg.created_at > m.last_read_at and msg.sender_id <> m.user_id and msg.hidden_at is null),
         m.story_prompt,
         case when m.role = 'owner'
              then (select count(*)::int from public.group_join_requests r where r.group_id = g.id and r.status = 'pending')
              else 0 end
  from public.group_members m
  join public.groups g on g.id = m.group_id
  join public.goals goal on goal.id = g.goal_id
  where m.user_id = auth.uid()
  order by (g.status = 'completed'), g.updated_at desc;
$$;

-- Grants: RPCs are for signed-in users, except listing groups on a goal page.
revoke execute on function public.create_group(uuid, text, text, int, text) from public, anon;
revoke execute on function public.join_group(uuid, text) from public, anon;
revoke execute on function public.cancel_join_request(uuid) from public, anon;
revoke execute on function public.respond_join_request(uuid, boolean) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.remove_group_member(uuid, uuid) from public, anon;
revoke execute on function public.update_group(uuid, text, text, int, text) from public, anon;
revoke execute on function public.update_group_plan(uuid, text, int, text, text) from public, anon;
revoke execute on function public.set_group_status(uuid, text) from public, anon;
revoke execute on function public.dismiss_story_prompt(uuid) from public, anon;
revoke execute on function public.mark_group_read(uuid) from public, anon;
revoke execute on function public.report_message(uuid, text, text) from public, anon;
revoke execute on function public.my_groups(text) from public, anon;
grant execute on function public.create_group(uuid, text, text, int, text) to authenticated;
grant execute on function public.join_group(uuid, text) to authenticated;
grant execute on function public.cancel_join_request(uuid) to authenticated;
grant execute on function public.respond_join_request(uuid, boolean) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.update_group(uuid, text, text, int, text) to authenticated;
grant execute on function public.update_group_plan(uuid, text, int, text, text) to authenticated;
grant execute on function public.set_group_status(uuid, text) to authenticated;
grant execute on function public.dismiss_story_prompt(uuid) to authenticated;
grant execute on function public.mark_group_read(uuid) to authenticated;
grant execute on function public.report_message(uuid, text, text) to authenticated;
grant execute on function public.my_groups(text) to authenticated;
grant execute on function public.goal_groups(uuid) to anon, authenticated;
