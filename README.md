# Buddies (placeholder name)

A global community where people share bucket-list goals and find others to do them with.

**Increment 1 (foundation):** public profiles, private location (PostGIS), and
bucket-list items with an Explore feed.

**Increment 2 (auth and onboarding):** passwordless sign-in (email magic link,
Google, Apple), an 18+ gate, a five-step onboarding (name and photo, home and
languages, interests and travel style, first 3 bucket-list goals), canonical
goals with multilingual matching, and public profiles at `/u/<username>` with
badges.

**Increment 3 (bucket list):** free-text items matched to canonical goals
(exact, then trigram fuzzy match, else a new goal pending review), item details
(timeframe, flexibility, budget, status, public / buddies / private), goal pages,
Explore (category, region, season, trending, near me) and 212 seeded goals.

**Increment 4 (matching):** for any item, a ranked list of people who share the
canonical goal, scored in Postgres (`find_matches`) on timeframe, distance (or
"worldwide" for far-away places), shared languages, travel style, budget and
recent activity, with reason chips. "Let's do this together" requests with a
short note, a requests inbox (accepting makes you buddies), and blocking.
Weights live in `src/lib/matching/config.ts`.

**Increment 5 (groups):** small groups around one goal (owner sets the size,
default 6; open or ask-to-join). Each group has Chat (Supabase Realtime, photos,
read receipts, reporting), Plan (date options with votes, location, budget,
shared checklist, status forming → planning → confirmed → completed), Members
and Memories (stories and chat photos). Completing a group marks every member's
item done and prompts each member to post a story; stories also show on goal pages.

**Increment 6 (social):** follow people from their profile; story posts with up
to 4 resized photos, caption, linked goal, city-level place and tagged group
members; reactions (❤️ 🔥 🙌 👏), comments and an "Add to my bucket list" button
on every story; a home feed for signed-in people that mixes stories from people
you follow and your groups, new groups for goals on your list, and trending
goals, each with the reason it's there. Feed weights live in `src/lib/feed/config.ts`.
Badges are earned from real milestones, celebrated once to their owner and shown
on profiles, never in feeds.

**Increment 7 (trust and safety):** phone verification with a "Phone verified"
badge (ID verification is a provider hook for later); Report on people, chat
messages, stories, comments and groups, with "Also block" for people; a
moderation queue at `/en/admin/moderation` (dismiss, warn, remove, suspend);
automatic text checks on posts and messages (a database term list plus a
pluggable app provider); safety tips before first meetups, "meet in public"
reminders and "Share my plan" links for a trusted contact; rate limits on
messages, follows, reports and shares; settings to hide from matching, use an
approximate (~25 km) location, download all your data and delete your account;
and a community guidelines page at `/en/guidelines`.

**Increment 8 (notifications):** a live notification bell and center; email
(Resend) and web push for new matches, buddy requests, accepted requests, group
messages (bundled), dates to vote on, trips coming up and story reactions;
per-type In app / Email / Push settings, quiet hours in each person's time zone,
one-click unsubscribe; and a weekly "Your bucket list digest" email. A scheduler
calls `/api/cron/notifications` to send (see `docs/increment-8-notifications.md`).

Every table has Row Level Security.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind v4 · shadcn/ui ·
Supabase (Postgres + PostGIS, Auth, RLS) · zod.

## Run it locally

Requires Node 20+ and Docker (for the local Supabase stack).

```bash
npm install
npx supabase start          # starts Postgres/Auth/API and applies supabase/migrations
cp .env.example .env.local  # paste the API URL and publishable key printed by `supabase start`
npm run dev                 # http://localhost:3000
```

Sign in with a magic link: the email lands in Mailpit at http://127.0.0.1:54324,
and the link takes you into onboarding at `/en/welcome`.

### Google and Apple sign-in

The buttons only show for providers listed in `NEXT_PUBLIC_AUTH_PROVIDERS`
(for example `google,apple`). Each needs to be enabled in Supabase
(Auth > Providers) with its own credentials:

- **Google:** an OAuth client ID and secret from Google Cloud Console (free).
  Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.
- **Apple:** needs a paid Apple Developer account, a Services ID, and a signing key.

The 18+ tick on the sign-in page is stored in a short-lived cookie and
recorded on the profile when the OAuth callback lands in `/auth/confirm`.

### Checks

```bash
npx tsc --noEmit && npm run lint && npm run build
npx supabase db reset       # the RLS test expects an empty database
supabase/tests/run_all.sh   # rls, matching, groups, social, trust_safety, notifications
```

Each test runs in a transaction, rolls back, and prints `ALL ... CHECKS PASSED`;
`run_all.sh` stops at the first one that doesn't.
Group chat needs the Realtime service: don't exclude `realtime` when running
`npx supabase start -x ...` (hosted projects have it on).

## Deploying to a hosted Supabase project

1. `npx supabase link --project-ref <ref>` then `npx supabase db push` to apply migrations.
2. In Auth > URL Configuration, set the Site URL and add `https://<your-domain>/auth/confirm` as a redirect URL.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`
   and `NEXT_PUBLIC_AUTH_PROVIDERS` in your host.
4. Set `SUPABASE_SECRET_KEY` (server only, never `NEXT_PUBLIC_`) so account deletion
   and suspension bans work. Optionally set `MODERATION_PROVIDER` (default `heuristics`).
5. Phone verification needs an SMS provider (Auth > Providers > Phone, e.g. Twilio,
   which is paid) and **"Confirm phone" turned on**; without it Supabase marks any
   number as verified without sending a code.
6. Notifications: set `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, the three VAPID
   variables and `NEXT_PUBLIC_SITE_URL`, then schedule `POST /api/cron/notifications`
   every minute (Supabase pg_cron + pg_net; steps in `docs/increment-8-notifications.md`).
7. Magic links on the hosted project use Supabase's built-in email sender, which is
   rate-limited and meant for testing; production needs a custom SMTP provider.

## Layout

```
src/
  proxy.ts                 locale redirect (/ -> /en) + Supabase session refresh
  i18n/                    locales, message dictionaries (typed; a missing key is a type error)
  app/[locale]/            all pages live under a locale segment
    (auth)/login           magic link, Google, Apple, 18+ checkbox (signup redirects here)
    welcome/               onboarding flow (age check if needed, then 5 steps)
    u/[username]/          public profile: bio, languages, stats, badges, active list
    profile/               edit profile + private "use my location"
    items/                 my bucket list (add from free text, edit details, delete)
    items/[itemId]/matches ranked buddies for one item, with "Let's do this together"
    requests/              requests inbox: waiting for you, doing it together, sent
    groups/                my groups (unread, story prompts, join requests)
    groups/[groupId]       group space: ?tab=chat|plan|members|memories
    stories/new            story composer (?goal=<slug>&group=<id>)
    stories/[storyId]      one story with reactions, comments and tags
    page.tsx               home: the feed when signed in, the landing page otherwise
    goals/[slug]/          goal page: description, counts, best time, add button
    explore/               browse goals: category, region, season, trending, near me
    settings/              phone verification, privacy, data export, delete account
    guidelines/            community guidelines (#meeting-safely for safety tips)
    share/[shareId]        read-only plan a trusted contact opens from "Share my plan"
    admin/moderation       moderation queue (moderators only; 404 for everyone else)
    notifications/         notification center (newest first, mark all read)
    unsubscribe/           email unsubscribe confirmation (works signed out)
  app/api/cron/notifications  the sender: queues reminders/digests, sends due email and push
  app/api/unsubscribe      RFC 8058 one-click unsubscribe (POST)
  app/api/export           "Download my data" (JSON)
  app/auth/confirm/        handles links from Supabase auth emails
  lib/actions/             Server Actions (validated with zod, protected by RLS)
  lib/auth.ts              data access layer: getCurrentUser, requireOnboardedProfile (verifies JWT)
  lib/badges.ts            badge names and emoji (rules live in badges_for() in 0008)
  lib/feed/config.ts       feed weights, decay and limits (the one place to tune)
  lib/stories.ts           loads story cards for feeds, goal pages and profiles
  lib/matching/config.ts   matching weights and tuning values (the one place to tune)
  lib/matching/reasons.ts  reason chips ("Both aiming for 2027", "Speaks Spanish")
  lib/images.ts            browser photo resize (strips EXIF/GPS) for chat and stories
  components/groups/       join button, create-group form
  components/stories/      story card, composer, reactions, "Add to my bucket list"
  components/feed/         home feed and the one-time badge celebration
  components/notifications/  bell (live unread count), notification list, push toggle
  lib/notifications/       render (words + links), email (Resend / local Mailpit), push (web-push), dispatch
  components/safety/       report button, verified badge, account notices, safety tips, share my plan
  lib/moderation/          text moderation: pluggable provider (MODERATION_PROVIDER), heuristics default
  lib/verification/        ID verification provider hook (none yet; Stripe Identity notes in TODO)
  lib/supabase/admin.ts    server-only secret-key client (deletion, bans); null if the key is unset
  lib/db-errors.ts         maps suspension, blocked text and rate-limit errors to messages
  components/              goal-search (typeahead over canonical goals), chip-picker
  lib/supabase/            server, browser and proxy clients + database types
supabase/
  migrations/              0001 profiles + private location, 0002 bucket items,
                           0003 onboarding fields, goals, avatars bucket, moderators,
                           0004 item details, fuzzy matching, follows, explore/goal RPCs,
                           0005 seed of 212 goals,
                           0006 matching: find_matches, match requests, blocks,
                           0007 groups, plan, chat, reports, stories, storage buckets,
                           0008 social: story photos, tags, reactions, comments,
                                home_feed, badges, follow counts,
                           0009 trust and safety: verification, reports, moderation queue
                                and actions, suspensions, warnings, text checks, rate
                                limits, privacy settings, plan shares, export, deletion,
                           0010 notifications: center, triggers, preferences, quiet hours,
                                push subscriptions, outbox, date reminders, weekly digest
  tests/rls_test.sql       RLS checks (two users + anonymous)
  tests/matching_test.sql  matching, requests and blocking checks
  tests/groups_test.sql    groups, plan, chat, reports, completion checks
  tests/social_test.sql    follows, stories, tags, reactions, comments, feed, badges
  tests/trust_safety_test.sql  verification, reports, queue, suspensions, limits, privacy,
                           plan shares, export and deletion
  tests/notifications_test.sql  triggers, bundling, preferences, quiet hours, outbox, digest
  tests/run_all.sh         runs every database test
```

## Privacy rules (enforced in the database)

- `profiles` is public and contains no email, phone or coordinates.
- The home point comes from the browser's location or, failing that, the typed
  home city geocoded on the server (`src/lib/geocode.ts`); coordinates never reach the browser.
- `profile_locations` holds the home point, already snapped to a ~5 km grid by
  `set_my_location()`; only its owner can read or write it. The UI only ever
  asks `has_my_location()`, which returns a boolean.
- Avatars live in the `avatars` bucket; each user can only write inside their own
  folder. Photos are re-encoded in the browser, which strips EXIF/GPS metadata.
- Bucket items are created only through `add_bucket_item()`, which links each one
  to a canonical goal (or creates a pending goal for moderators to review).
- `adult_confirmed_at` and `onboarded_at` can only be set through RPCs, and
  onboarding can't complete without the 18+ confirmation.
- Bucket items are public, buddies-only (mutual follows, via `are_buddies()`)
  or private (owner only). Goal counts include every item but never say whose.
- Matching only uses public items (or buddies-only items of buddies), never private
  ones, skips anyone blocked in either direction, and returns distances rounded
  (under 25 km, then to 10, 50 or 100 km). Coordinates never leave the database.
- Match requests and blocks are written only through RPCs. Each side of a request
  can read it; only the blocker can see a block.
- Group chat, plan and member lists are readable only by members (RLS, also
  applied to Realtime events). Chat photos are in the private `group-media`
  bucket under the group's folder and are shown through short-lived signed URLs.
- A chat message reported by 3 members is hidden from everyone but its sender
  and moderators. Who ticked a checklist item is recorded by the database.
- Stories are public. Story photos go in the public `stories` bucket, only in the
  author's own folder, after the browser re-encodes them (no EXIF/GPS). `place` is
  free text the author types, capped at 100 characters; the form asks for city or
  region only. People can be tagged only if they're in the story's group, and can
  remove their own tag.
- Blocks hide stories, reactions and comments both ways, and block follows. Who
  blocked whom is never revealed (`blocked_with_me()` answers only for the caller).
- Comments are limited to 30 an hour per person, stories to 10 a day.
- Phone numbers stay in Supabase Auth; profiles only get `phone_verified_at`,
  set by a database trigger when Auth confirms the number. Nobody can set it,
  or `id_verified_at`, from the browser.
- "Approximate location only" re-snaps the home point to a ~25 km grid; "Hide me
  from matching" drops all your items from everyone's matches.
- Reports are visible only to the person who made them and to moderators; the
  reported person is never told who reported them. Moderation actions are logged
  with a snapshot of the content.
- A suspended person can read but can't post, message, follow or join (they can still report);
  the database enforces this, and their sign-in is banned for the same period.
- Rate limits: 20 messages a minute and 500 a day, 60 follows an hour, 20 reports
  a day, 10 active plan shares.
- "Share my plan" links are unguessable, expire (3 to 30 days) and can be revoked.
  They show the goal, group, status, typed location, dates and first names, never
  exact locations or contact details. Only the contact's label is stored.
- "Download my data" includes everything stored about you; deleting your account
  removes your profile, items, messages, stories and photos, and hands groups you
  own to the longest-standing member.
- Notifications, preferences, settings and push subscriptions are readable only by
  their owner. The email/push outbox has no client access at all; only the server's
  secret key can claim deliveries, and that's the only place an email address leaves
  `auth.users`. Blocked people can't notify you. Unsubscribe links carry a random
  per-person token, never the address.
- All timestamps are `timestamptz` (UTC). `target_date` is a calendar date with no time.

## Adding a language

Add the code to `src/i18n/config.ts`, create `src/i18n/messages/<code>.ts`
typed as `Messages`, and register it in `src/i18n/get-messages.ts`.

## Known TODOs

- `TODO(brand)`: the app name is a placeholder (`src/i18n/messages/en.ts`).
- `TODO(geocoding)`: typed home cities are geocoded with the free public
  Nominatim server (1 request/second policy). At scale, self-host it and set `NOMINATIM_URL`.
- `TODO(age-gate)`: delete accounts that never confirm 18+ (needs a service-role job).
- `TODO(moderation)`: pending goals aren't in the moderation queue yet; the blocked/review
  term list in `moderation_terms` (0009) is a small English starter set.
- `TODO(moderation-provider)`: plug in an external text classifier (`src/lib/moderation/`).
- `TODO(notifications)`: comments, new followers and join requests don't notify yet.
- `TODO(sms)`: production phone verification needs a paid SMS provider (local uses a test number).
- `TODO(id-verification)`: ID checks via a provider such as Stripe Identity (`src/lib/verification/`).
- `TODO(chat)`: load older messages (the chat shows the latest 100).
- `TODO(stories)`: goal pages list stories newest first; consider ranking by reactions.
- `TODO(storage)`: photos removed in the story composer stay in the bucket; clean up with a scheduled job.
- `TODO(goal-photos)`: seeded goals use category artwork; add licensed photos with credits.
- `TODO(feed)`: paginate Explore; send signed-in people who haven't onboarded to /welcome from home.
- `TODO(i18n)`: `not-found` and `error` pages are English-only for now.
