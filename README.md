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
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/matching_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/groups_test.sql
```

Each test runs in a transaction, rolls back, and prints `ALL ... CHECKS PASSED`.
Group chat needs the Realtime service: don't exclude `realtime` when running
`npx supabase start -x ...` (hosted projects have it on).

## Deploying to a hosted Supabase project

1. `npx supabase link --project-ref <ref>` then `npx supabase db push` to apply migrations.
2. In Auth > URL Configuration, set the Site URL and add `https://<your-domain>/auth/confirm` as a redirect URL.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`
   and `NEXT_PUBLIC_AUTH_PROVIDERS` in your host.
4. Magic links on the hosted project use Supabase's built-in email sender, which is
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
    goals/[slug]/          goal page: description, counts, best time, add button
    explore/               browse goals: category, region, season, trending, near me
  app/auth/confirm/        handles links from Supabase auth emails
  lib/actions/             Server Actions (validated with zod, protected by RLS)
  lib/auth.ts              data access layer: getCurrentUser, requireOnboardedProfile (verifies JWT)
  lib/badges.ts            badge rules, computed from profile stats
  lib/matching/config.ts   matching weights and tuning values (the one place to tune)
  lib/matching/reasons.ts  reason chips ("Both aiming for 2027", "Speaks Spanish")
  lib/images.ts            browser photo resize (strips EXIF/GPS) for chat and stories
  components/groups/       join button, create-group form, story list
  components/              goal-search (typeahead over canonical goals), chip-picker
  lib/supabase/            server, browser and proxy clients + database types
supabase/
  migrations/              0001 profiles + private location, 0002 bucket items,
                           0003 onboarding fields, goals, avatars bucket, moderators,
                           0004 item details, fuzzy matching, follows, explore/goal RPCs,
                           0005 seed of 212 goals,
                           0006 matching: find_matches, match requests, blocks,
                           0007 groups, plan, chat, reports, stories, storage buckets
  tests/rls_test.sql       RLS checks (two users + anonymous)
  tests/matching_test.sql  matching, requests and blocking checks
  tests/groups_test.sql    groups, plan, chat, reports, completion checks
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
- All timestamps are `timestamptz` (UTC). `target_date` is a calendar date with no time.

## Adding a language

Add the code to `src/i18n/config.ts`, create `src/i18n/messages/<code>.ts`
typed as `Messages`, and register it in `src/i18n/get-messages.ts`.

## Known TODOs

- `TODO(brand)`: the app name is a placeholder (`src/i18n/messages/en.ts`).
- `TODO(geocoding)`: typed home cities are geocoded with the free public
  Nominatim server (1 request/second policy). At scale, self-host it and set `NOMINATIM_URL`.
- `TODO(age-gate)`: delete accounts that never confirm 18+ (needs a service-role job).
- `TODO(badges)`: persist awarded badges once notifications need them.
- `TODO(follows)`: follow/unfollow UI (until then, buddies-only items are visible only to you).
- `TODO(moderation)`: a review screen for reported messages and pending goals.
- `TODO(chat)`: load older messages (the chat shows the latest 100).
- `TODO(notifications)`: new requests show as a badge on the header inbox; no email or push yet.
- `TODO(stories)`: rank stories by reactions once reactions exist (newest first for now).
- `TODO(goal-photos)`: seeded goals use category artwork; add licensed photos with credits.
- `TODO(feed)`: paginate Explore.
- `TODO(i18n)`: `not-found` and `error` pages are English-only for now.
