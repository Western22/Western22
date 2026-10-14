# Buddies (placeholder name)

A global community where people share bucket-list goals and find others to do them with.

**Increment 1 (foundation):** email/password auth, public profiles, private
location (PostGIS), and bucket-list items with an Explore feed. Every table has
Row Level Security.

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

Locally, email confirmation is off (see `supabase/config.toml`), so sign-up logs
you straight in. Emails the local stack sends are visible in Mailpit at
http://127.0.0.1:54324.

### Checks

```bash
npx tsc --noEmit && npm run lint && npm run build
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
```

The RLS test runs in a transaction, rolls back, and prints `ALL RLS CHECKS PASSED`.

## Deploying to a hosted Supabase project

1. `npx supabase link --project-ref <ref>` then `npx supabase db push` to apply migrations.
2. In Auth > URL Configuration, set the Site URL and add `https://<your-domain>/auth/confirm` as a redirect URL.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` in your host.

## Layout

```
src/
  proxy.ts                 locale redirect (/ -> /en) + Supabase session refresh
  i18n/                    locales, message dictionaries (typed; a missing key is a type error)
  app/[locale]/            all pages live under a locale segment
    (auth)/login, signup   email + password
    profile/               public profile + private "use my location"
    items/                 my bucket list (add, mark done, delete)
    explore/               public items from everyone
  app/auth/confirm/        handles links from Supabase auth emails
  lib/actions/             Server Actions (validated with zod, protected by RLS)
  lib/auth.ts              data access layer: getCurrentUser / requireUser (verifies JWT)
  lib/supabase/            server, browser and proxy clients + database types
supabase/
  migrations/              0001 profiles + private location, 0002 bucket items
  tests/rls_test.sql       RLS checks (two users + anonymous)
```

## Privacy rules (enforced in the database)

- `profiles` is public and contains no email, phone or coordinates.
- `profile_locations` holds the exact point; only its owner can read or write it.
  The UI only ever asks `has_my_location()`, which returns a boolean.
- Private bucket items are visible only to their owner.
- All timestamps are `timestamptz` (UTC). `target_date` is a calendar date with no time.

## Adding a language

Add the code to `src/i18n/config.ts`, create `src/i18n/messages/<code>.ts`
typed as `Messages`, and register it in `src/i18n/get-messages.ts`.

## Known TODOs

- `TODO(brand)`: the app name is a placeholder (`src/i18n/messages/en.ts`).
- `TODO(matching)`: geocode an item's place into a PostGIS point.
- `TODO(feed)`: paginate Explore.
- `TODO(i18n)`: `not-found` and `error` pages are English-only for now.
