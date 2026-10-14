# Increment 6: social layer

## What I built

- **Follow.** Profiles have a Follow / Following button and show follower and following counts. Following someone puts their stories in your feed. Following each other also makes you buddies, as before.
- **Story posts** (`/en/stories/new`). You reach the composer from:
  - a done item on My bucket list,
  - a goal page once your item is done,
  - a group's "You did it!" banner or its Memories tab.

  A story has:
  - up to 4 photos, resized in the browser to 1600 px JPEG, which also strips location data;
  - a caption and the linked goal;
  - a place, typed as city or region only;
  - optionally the group it was done with, plus tags for people in that group (all ticked by default).

  Each story has its own page (`/en/stories/<id>`). Tagged people can remove their tag.
- **On every story:**
  - Four reactions: ❤️ Love, 🔥 Fire, 🙌 Inspiring and 👏 Congrats.
  - Plain-text comments. The author of a comment or the story's owner can delete it.
  - **"Add to my bucket list"**, which adds the goal to your list and remembers which story inspired it. The story then shows "Added from this story: N".
- **Home feed.** Signed-in people see the feed at `/en`; everyone else still sees the landing page. Every item says why it's there, for example "Because you follow Ola", "From your group Inca crew" or "Machu Picchu is on your list". The feed has three kinds of item:
  - Stories from people you follow, from your groups, or about goals on your list.
  - New open groups for goals on your list (at most 5).
  - The 3 most-added goals this month.
- **The ranking is a short, readable formula.** It is in `home_feed()` in migration 0008, and the weights are in `src/lib/feed/config.ts`:
  - A story scores 3 if you follow the author, plus 3 if it's from your group, plus 1 if its goal is on your list, plus 0.2 per reaction (the reaction boost is capped at 2).
  - That score halves every 48 hours. Only the last 30 days count.
  - A new group scores 2, with the same fading.
  - Trending goals score 1.5 ÷ their rank.

  A "How your feed works" note at the bottom of the feed explains this in plain words.
- **Badges.** There are 9 badges: First dream, Big dreamer (10 goals), Doer, Unstoppable (5 done), Better together (first group), Summit crew (completed a goal with a group), Storyteller, Globetrotter (done goals in 5 countries) and Polyglot (3 languages).
  - They are worked out from real data, and only public and buddies-only items count.
  - When you earn new ones, the top of your feed shows them once, with a "Nice!" button. Nobody else sees that message.
  - Badges show on profiles and never appear in anyone's feed.

## Migration to run

`supabase/migrations/20261014000008_social.sql`. It changes:

- **Stories:** they get `photo_urls` (up to 4) and `place`. The old `photo_url` column is copied over, then dropped. Stories are created only through `create_story()`.
- **New tables:** `story_tags`, `story_reactions`, `story_comments` and `user_badges` (which badges each person has already been shown).
- **Bucket items:** a new `source_story_id` column.
- **New functions:** `follow_counts`, `add_goal_from_story`, `story_cards`, `home_feed`, `badges_for`, `new_badges`, `mark_badges_seen` and `blocked_with_me`.
- **Blocks:** blocked people no longer see each other's stories, reactions or comments, and can't follow each other.

Locally, run `npx supabase db reset`. On a hosted project, run `npx supabase db push`. There are no new services or dependencies.

## What to test

1. As person A, open person B's profile, tap Follow and check the follower count.
2. As B, finish a goal, either with a group marked Completed or by setting an item to Done, then tap "Share a story". Add 2 photos and a place, tag a group member, and post it.
3. As B, open the home page. You should see your new badges once. Tap "Nice!" and reload: the message is gone, and the badges are on your profile.
4. As A, open the home page. B's story should say "Because you follow B". React with 🔥, leave a comment, and tap "Add to my bucket list".
5. As B, open the story. It should show "Added from this story: 1", the reaction and the comment, and you can delete the comment.
6. Sign out and open the story link. You can read it, but reacting or adding it asks you to sign in.

## Checks run

- Typecheck, lint and production build pass.
- The new database test (`supabase/tests/social_test.sql`) passes, and the RLS, matching and groups tests still pass. It covers:
  - Follows and blocks.
  - Story photo URLs being limited to your own folder, tags limited to group members, and the daily story cap.
  - Reactions and comments, including the comment rate limit and who can delete a comment.
  - Adding a goal from a story.
  - Feed reasons and ordering.
  - Badges and one-time celebrations.
  - What signed-out visitors can read.
- A new three-person browser run at phone size covers:
  - following someone and posting a story with 2 photos, a place and a tag;
  - the badge message showing once;
  - the feed reasons for a follower and a group member;
  - a reaction, a comment and "Add to my bucket list";
  - removing a tag, and reading a story signed out.

  It had no page errors and no horizontal scrolling.
- The groups, matching, bucket-list, onboarding, age-gate and location browser runs still pass. The groups run now posts its story through the new composer.

## Small changes elsewhere

- The story form inside the group's Memories tab is replaced by a link to the composer, so there's one way to post.
- Counts that read badly for 1 ("1 followers") now put the label first ("Followers 1", "Comments: 1").

## Not built yet

- A moderation screen for comments (`TODO(moderation)`).
- Cleaning up photos removed in the composer before posting (`TODO(storage)`).
- Notifications for new followers, reactions or comments.
- Editing a story after posting (you can't yet; you can remove a tag).
