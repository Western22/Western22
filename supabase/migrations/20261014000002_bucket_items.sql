-- =============================================================================
-- 0002 · Bucket-list items
--
-- A bucket item is a goal one person wants to do ("See the northern lights").
-- Public items are visible to everyone and will feed matching later; private
-- items are visible only to their owner.
-- =============================================================================

create table public.bucket_items (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  title          text not null check (char_length(trim(title)) between 3 and 140),
  description    text check (char_length(description) <= 2000),
  category       text not null default 'other'
                 check (category in (
                   'adventure', 'travel', 'learning', 'creative', 'sport',
                   'food', 'nature', 'culture', 'social', 'other'
                 )),
  visibility     text not null default 'public'
                 check (visibility in ('public', 'private')),
  status         text not null default 'dreaming'
                 check (status in ('dreaming', 'planning', 'done')),
  -- Where the goal happens (e.g. "Mount Kilimanjaro"). This is a place, not the
  -- user's location, so it is safe to show publicly.
  -- TODO(matching): add a geocoded geography(point) column once a geocoder is chosen.
  place_name     text check (char_length(place_name) <= 120),
  place_country  text check (place_country ~ '^[A-Z]{2}$'),
  -- Calendar target with no time-of-day, so a plain date (timezone-free) is correct.
  target_date    date,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- completed_at is set exactly when status is 'done'.
  constraint bucket_items_completed_consistent
    check ((status = 'done') = (completed_at is not null))
);

comment on table public.bucket_items is 'Bucket-list goals. Public rows are readable by anyone.';

create index bucket_items_owner_idx on public.bucket_items (owner_id, created_at desc);
create index bucket_items_public_feed_idx on public.bucket_items (created_at desc)
  where visibility = 'public';

create trigger bucket_items_set_updated_at
  before update on public.bucket_items
  for each row execute function public.set_updated_at();

-- Keep completed_at in sync with status so clients only have to set status.
create or replace function public.bucket_items_sync_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger bucket_items_sync_completed_at
  before insert or update of status on public.bucket_items
  for each row execute function public.bucket_items_sync_completed_at();

alter table public.bucket_items enable row level security;

create policy "public items are readable by anyone; private by owner"
  on public.bucket_items for select
  to anon, authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()));

create policy "owner can create items"
  on public.bucket_items for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "owner can update items"
  on public.bucket_items for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner can delete items"
  on public.bucket_items for delete
  to authenticated
  using (owner_id = (select auth.uid()));
