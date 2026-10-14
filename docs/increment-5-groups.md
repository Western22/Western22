# Increment 5: groups

## What I built

- **Groups around one goal.** On any goal page, "Start a group" lets you choose:
  - A name and description.
  - A size from 2 to 20 people, 6 by default.
  - Whether anyone can join or people have to ask.

  The Groups section on the goal page lists that goal's groups with a Join, Ask to join (with a note) or Open group button. Joining a group puts the goal on your list if it isn't there already.
- **My groups** (`/en/groups`), from the new people icon in the header. Its badge counts unread messages, story prompts and join requests waiting for the owner.
- **The group space** (`/en/groups/<id>`) has four tabs:
  - **Chat:** live over Supabase Realtime.
    - Photos are resized in the browser, which strips location data, and kept private to members.
    - Under your latest message you see "Seen by N" or "Seen by everyone".
    - You can report any message as spam, harassment, inappropriate or something else. After 3 reports it's hidden from everyone except its sender.
  - **Plan:**
    - Status: forming → planning → confirmed → completed. Only the owner can change it.
    - Proposed dates with "Works for me" votes, best-voted first.
    - Location, budget per person with currency, and notes.
    - A shared checklist grouped into visas, gear, bookings and other. It shows who ticked each item.
  - **Members:**
    - Everyone in the group, with a Leave button. If the owner leaves, the longest-standing member takes over.
    - The owner can also accept or decline join requests, remove people, and edit the name, size and how people join.
  - **Memories:** the group's stories, each with an optional photo, plus a grid of photos shared in the chat.
- **Completing the goal.** When the owner marks the group Completed (after a confirmation, because it can't be undone):
  - Every member's item for that goal is set to Done.
  - Each member sees a "You did it! Share a story" banner until they post a story or tap "Not now".
  - Stories also appear under "Top stories" on the goal page.
- **From matching:** accepted requests now show a "Start a group" link on the Requests page.

## Migration to run

`supabase/migrations/20261014000007_groups.sql` adds:

- Tables: `groups`, `group_members`, `group_join_requests`, `group_plans`, `group_date_options`, `group_date_votes`, `group_checklist_items`, `group_messages`, `message_reports` and `stories`.
- The group functions.
- Realtime for chat messages and read receipts.
- Two storage buckets: private `group-media` and public `stories`.

Locally, run `npx supabase db reset`; on a hosted project, run `npx supabase db push`.

Locally, chat needs the Realtime service. If you start Supabase with `-x` to skip services, leave `realtime` and `storage-api` out of that list. On hosted Supabase both are on already, and there's no extra cost on the free plan.

## What to test

1. As person A, open a goal page and start a group with size 3.
2. As person B, join it from the same goal page. Chat back and forth in two browsers: messages and photos should appear without reloading, and A should see "Seen by everyone".
3. On Plan, propose dates and vote from both accounts. Save a location and budget, add "Apply for e-visa" under Visas and tick it.
4. As A, open Members and switch to "People ask to join". As person C, ask to join with a note. As A, accept it, and the group shows 3/3.
5. As A, set the status to Completed. Check that B's item now says Done and that B sees the story banner. Post a story with a photo: it shows in Memories and on the goal page.

## Checks run

- Typecheck, lint and production build pass.
- The new database test (`supabase/tests/groups_test.sql`) passes, and the RLS and matching tests still pass. It covers:
  - Creating and joining groups, the size limit, request-to-join and blocked users.
  - Outsiders seeing neither members nor messages.
  - Plan and checklist rules (only the database records who ticked an item).
  - Photo paths having to stay in the group's folder, and no impersonation.
  - Unread counts, one report per person, and hiding after 3 reports.
  - Completion marking every member's item done and prompting stories.
  - Owner hand-over when the owner leaves, and no access when signed out.
- A three-person browser run at phone size covers the whole flow, with no page errors and no horizontal scrolling. The earlier onboarding, age-gate, location, bucket-list and matching runs still pass.

## Small changes elsewhere

- On phones, the header shows Explore and Profile as icons so the new group and inbox icons fit. The text stays for screen readers.

## Not built yet

- A moderator screen for reported messages (`TODO(moderation)`).
- Loading chat history beyond the latest 100 messages (`TODO(chat)`).
- Email or push notifications.
- Reactions on stories, so "Top stories" can be ranked (newest first for now).
