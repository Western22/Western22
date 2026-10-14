-- =============================================================================
-- Social smoke test: follows, stories (photos, tags), reactions, comments,
-- add-from-story, the home feed and badges. Rolls back. Local database only:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/social_test.sql
-- Success prints "ALL SOCIAL CHECKS PASSED".
-- =============================================================================
begin;

-- a1 Ama (reader), b2 Bo (Ama follows), c3 Cara (in a group with Ama), d4 Dex (stranger), e5 Eko (blocked by Ama)
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || k)::uuid, k || '@example.com',
       jsonb_build_object('display_name', n, 'adult_confirmed', true)
from (values ('a1','Ama'),('b2','Bo'),('c3','Cara'),('d4','Dex'),('e5','Eko')) v(k, n);
update public.profiles set username = lower(display_name) || '_s', onboarded_at = now(),
       languages = case when display_name = 'Bo' then '{en,fr,es}' else '{en}' end::text[]
 where id::text like '00000000-0000-0000-0000-0000000000%';
insert into public.blocks values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e5');

-- Ama wants Kilimanjaro and the piano. Bo has done 5 goals in 5 countries.
insert into public.bucket_items (owner_id, title, goal_id)
select '00000000-0000-0000-0000-0000000000a1', slug, id from public.goals where slug in ('climb-mount-kilimanjaro', 'learn-to-play-the-piano');
insert into public.bucket_items (owner_id, title, goal_id, status, completed_at)
select '00000000-0000-0000-0000-0000000000b2', g.slug, g.id, 'done', now()
from (select distinct on (place_country) id, slug from public.goals
      where place_country is not null and slug <> 'climb-mount-kilimanjaro' order by place_country, slug limit 5) g;

-- A group with Ama and Cara for Kilimanjaro (owned by Cara), and a newer open group by Dex.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated, anon;
insert into ids select 'group', public.create_group((select id from public.goals where slug = 'climb-mount-kilimanjaro'), 'Kili crew');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select public.join_group((select v from ids where k = 'group'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
insert into ids select 'dex_group', public.create_group((select id from public.goals where slug = 'learn-to-play-the-piano'), 'Piano beginners');

-- ---------- Ama follows Bo; can't follow someone blocked ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into public.follows (follower_id, followee_id) values (auth.uid(), '00000000-0000-0000-0000-0000000000b2');
do $$ begin
  begin
    insert into public.follows (follower_id, followee_id) values (auth.uid(), '00000000-0000-0000-0000-0000000000e5');
    raise exception 'followed a blocked user';
  exception when insufficient_privilege then null;
  end;
  assert (select followers from public.follow_counts('00000000-0000-0000-0000-0000000000b2')) = 1, 'follower count';
  assert (select i_follow from public.follow_counts('00000000-0000-0000-0000-0000000000b2')), 'i_follow';
end $$;

-- ---------- Stories ----------
-- Bo (followed) posts about the Northern Lights; Cara posts in the group and tags Ama;
-- Dex (stranger) posts about the piano (on Ama's list); Eko (blocked) posts too.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
insert into ids select 'bo_story', public.create_story((select id from public.goals where slug = 'see-the-northern-lights'),
  'Green skies over Tromsø', null, 'Tromsø, Norway',
  array['http://127.0.0.1:54321/storage/v1/object/public/stories/00000000-0000-0000-0000-0000000000b2/a.jpg']);
do $$ begin
  begin
    perform public.create_story((select id from public.goals where slug = 'see-the-northern-lights'), 'x', null, null,
      array['http://127.0.0.1:54321/storage/v1/object/public/stories/00000000-0000-0000-0000-0000000000c3/stolen.jpg']);
    raise exception 'used someone else''s photo';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_story((select id from public.goals where slug = 'see-the-northern-lights'), 'x', null, null, '{}',
      array['00000000-0000-0000-0000-0000000000a1']::uuid[]);
    raise exception 'tagged without a group';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.stories (goal_id, body) values ((select id from public.goals where slug = 'see-the-northern-lights'), 'direct');
    raise exception 'direct story insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
insert into ids select 'cara_story', public.create_story((select id from public.goals where slug = 'climb-mount-kilimanjaro'),
  'Training hike done', (select v from ids where k = 'group'), 'Arusha', '{}', array['00000000-0000-0000-0000-0000000000a1']::uuid[]);
do $$ begin
  begin
    perform public.create_story((select id from public.goals where slug = 'climb-mount-kilimanjaro'), 'x',
      (select v from ids where k = 'group'), null, '{}', array['00000000-0000-0000-0000-0000000000d4']::uuid[]);
    raise exception 'tagged a non-member';
  exception when invalid_parameter_value then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
insert into ids select 'dex_story', public.create_story((select id from public.goals where slug = 'learn-to-play-the-piano'), 'Played my first piece!');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e5","role":"authenticated"}', true);
insert into ids select 'eko_story', public.create_story((select id from public.goals where slug = 'learn-to-play-the-piano'), 'Blocked story');

-- ---------- Ama reads, reacts, comments, adds from a story ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  feed record;
  reasons text;
  card record;
begin
  -- Feed: group story, followed story, story for a goal on my list, Dex's new group, trending goals.
  select string_agg(reason || ':' || coalesce(reason_label, ''), ' | ' order by score desc) into reasons from public.home_feed();
  assert reasons like 'group:Kili crew%', 'group story ranks first; got ' || reasons;
  assert reasons like '%follow:Bo%', 'followed story present';
  assert reasons like '%on_list:Learn to play the piano%', 'on-list story present';
  assert reasons like '%new_group:Learn to play the piano%', 'new group for a goal on my list';
  assert reasons like '%trending:%', 'trending goals included';
  assert not exists (select 1 from public.home_feed() where story_id = (select v from ids where k = 'eko_story')), 'blocked author excluded';
  assert not exists (select 1 from public.home_feed() where group_id = (select v from ids where k = 'group') and kind = 'new_group'),
         'my own group is not suggested';
  assert not exists (select 1 from public.home_feed() f join public.goals g on g.id = f.goal_id
                     where f.kind = 'trending_goal' and g.slug in ('climb-mount-kilimanjaro', 'learn-to-play-the-piano')),
         'trending skips goals already on my list';
  -- Weights are tunable: with follows boosted, Bo's story leads.
  assert (select reason from public.home_feed('{"weights":{"follow":50}}') limit 1) = 'follow', 'feed weights are tunable';
  assert not exists (select 1 from public.stories where id = (select v from ids where k = 'eko_story')), 'blocked author''s story hidden';

  insert into public.story_reactions (story_id, kind) values ((select v from ids where k = 'bo_story'), 'love'), ((select v from ids where k = 'bo_story'), 'fire');
  insert into public.story_comments (story_id, body) values ((select v from ids where k = 'bo_story'), 'Stunning!');
  begin
    insert into public.story_reactions (story_id, kind) values ((select v from ids where k = 'bo_story'), 'meh');
    raise exception 'unknown reaction accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.story_reactions (story_id, user_id, kind) values ((select v from ids where k = 'bo_story'), '00000000-0000-0000-0000-0000000000d4', 'love');
    raise exception 'reacted as someone else';
  exception when insufficient_privilege then null;
  end;

  perform public.add_goal_from_story((select v from ids where k = 'bo_story'));
  begin
    perform public.add_goal_from_story((select v from ids where k = 'bo_story'));
    raise exception 'added twice';
  exception when unique_violation then null;
  end;

  select * into card from public.story_cards(array[(select v from ids where k = 'bo_story'), (select v from ids where k = 'cara_story')]::uuid[]);
  assert card.author_username = 'bo_s' and card.place = 'Tromsø, Norway' and cardinality(card.photo_urls) = 1, 'card basics (first in order)';
  assert card.reactions = '{"fire": 1, "love": 1}'::jsonb and card.my_reactions @> '{love,fire}', 'reaction counts and mine';
  assert card.comment_count = 1 and card.inspired_count = 1 and card.on_my_list, 'comments, inspired count, on my list';
  assert (select tagged from public.story_cards(array[(select v from ids where k = 'cara_story')]::uuid[])) @> '[{"username":"ama_s"}]',
         'tagged members listed';
  assert (select count(*) from public.story_cards(array[(select v from ids where k = 'eko_story')]::uuid[])) = 0, 'blocked card hidden';

  -- Ama can untag herself.
  delete from public.story_tags where story_id = (select v from ids where k = 'cara_story');
  assert (select count(*) from public.story_tags where story_id = (select v from ids where k = 'cara_story')) = 0, 'untagged';
end $$;

-- Story owner can delete comments on their story; Dex can't delete Ama's comment.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
do $$ begin
  delete from public.story_comments;
  reset role;
  assert (select count(*) from public.story_comments) = 1, 'stranger could not delete';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  -- Bo's badges: 5 done goals in 5 countries, 3 languages, a story.
  assert (select array_agg(badge order by badge) from public.badges_for(auth.uid()))
         = '{doer,first_dream,globetrotter,polyglot,storyteller,unstoppable}', 'bo badges: '
           || (select array_agg(badge order by badge) from public.badges_for(auth.uid()))::text;
  assert (select count(*) from public.new_badges()) = 6, 'all new';
  perform public.mark_badges_seen();
  assert (select count(*) from public.new_badges()) = 0, 'each milestone shown once';
  delete from public.story_comments;
  reset role;
  assert (select count(*) from public.story_comments) = 0, 'story owner deleted the comment';
end $$;

-- Ama's badges include her group.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  assert exists (select 1 from public.badges_for(auth.uid()) where badge = 'first_group'), 'first group badge';
  assert not exists (select 1 from public.badges_for(auth.uid()) where badge = 'team_player'), 'no team badge before completion';
end $$;

-- ---------- Limits: 30 comments an hour, 10 stories a day ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
do $$
declare
  story uuid := (select v from ids where k = 'bo_story');
  goal uuid := (select id from public.goals where slug = 'learn-to-play-the-piano');
begin
  for i in 1..(30 - (select count(*) from public.story_comments where author_id = auth.uid())) loop
    insert into public.story_comments (story_id, body) values (story, 'nice ' || i);
  end loop;
  begin
    insert into public.story_comments (story_id, body) values (story, 'one too many');
    raise exception 'comment limit not enforced';
  exception when insufficient_privilege then null;
  end;
  for i in 1..(10 - (select count(*) from public.stories where author_id = auth.uid())) loop
    perform public.create_story(goal, 'practice ' || i);
  end loop;
  begin
    perform public.create_story(goal, 'one too many');
    raise exception 'story limit not enforced';
  exception when sqlstate '54000' then null;
  end;
end $$;

-- ---------- Signed out ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  assert (select count(*) from public.story_cards(array(select v from ids where k like '%story'))) = 4, 'anon sees all stories';
  assert (select count(*) from public.badges_for('00000000-0000-0000-0000-0000000000b2')) = 6, 'badges are public';
  begin
    perform public.home_feed();
    raise exception 'anon got a feed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.story_reactions (story_id, kind) values ((select v from ids where k = 'bo_story'), 'love');
    raise exception 'anon reacted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'ALL SOCIAL CHECKS PASSED' as result;
rollback;
