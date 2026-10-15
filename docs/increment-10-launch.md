# Increment 10: launch prep

## Search engines and sharing

- **Public pages are indexable:** home, Explore, guidelines, every goal page and every story. Each has a title, description, canonical URL and language alternates.
- **Share images.** Goal and story links show a 1200×630 card (category colour, title, how many people want it, or the story's opening line). Stories with a photo use the photo.
- **`/sitemap.xml`** lists public pages, active goals and recent stories (refreshed hourly). **`/robots.txt`** allows public pages and blocks `/api`, `/auth` and private pages.
- **Private pages** (bucket list, matches, requests, groups, settings, notifications, sign-in, new story) say `noindex`. Public profiles say `noindex` but links on them are followed, so people's names don't show up in search results.
- **Staging is never indexed.** Indexing is on only where `ALLOW_INDEXING=true`, which goes in production only. Everywhere else robots.txt says `Disallow: /` and every page says `noindex`.
- Goal pages now load the goal from a short cache and stream the "your item", stories and groups sections separately, so the page appears faster.

## Accessibility (WCAG 2.1 AA)

- Checked with axe-core on 23 pages (signed out and signed in), at phone and desktop widths. No WCAG A or AA issues were found; best-practice issues are fixed:
  - a "Skip to content" link (first Tab stop) that jumps to the main content;
  - header and footer menus have names for screen readers;
  - every page has exactly one main heading;
  - images have fixed sizes so the page doesn't jump while loading.
- Lighthouse accessibility is 100 on every public page tested.

## Performance (Lighthouse, phone, throttled)

| Page | Performance | SEO |
| --- | --- | --- |
| Home | 95 | 100 |
| Explore | 94 | 100 |
| Goal page | 80–94 (varies between runs) | 92 |
| Guidelines | 94 | 100 |
| Sign-in | 90 | 63 (on purpose: `noindex`) |

Accessibility and best practices are 100 on all of them. The goal page varies because its description is streamed in; Lighthouse's SEO score of 92 there is its tool reading streamed tags, and real crawlers get them (social-media crawlers get them in the page head).

## Error monitoring (Sentry)

- `@sentry/nextjs` reports errors from the browser, server and edge. Off until `NEXT_PUBLIC_SENTRY_DSN` is set; Sentry's free tier is enough to start.
- **Personal data is stripped before sending:** email addresses, cookies, request bodies, sign-in links and tokens, auth headers. Only the user's id is kept. Session replay is off.
- `POST /api/monitoring/test-error` with `Authorization: Bearer <CRON_SECRET>` throws on purpose so you can confirm reports arrive. Without the secret it returns 401.
- Source maps upload at build only when `SENTRY_AUTH_TOKEN` is set, and are removed from the public build after upload.

## Demo data

`npm run seed:demo` adds 24 example people, their bucket lists, 12 stories with comments and reactions, and 4 completed groups, so the app never looks empty.

- Every demo person is labelled "Example profile, shown so you can see how the app works.", has a `@demo.invalid` email (no mail can be sent), and is **hidden from matching**, so no real person is matched with or notified about them.
- Safe to run twice (adds nothing the second time). `npm run seed:demo -- --remove` deletes all of it.
- It refuses a non-local database unless you add `--yes`.

## Deploying, backups, checklist

- **`docs/deploy.md`**: Vercel production (`main`) and staging (`staging` branch) with separate Supabase projects, every environment variable, scheduled jobs, Sentry setup, backups and restoring, releasing and rolling back.
- **`vercel.json`** schedules the daily exchange-rate refresh on Vercel Cron. Notifications still need the every-minute pg_cron job.
- **`.github/workflows/db-backup.yml`**: free nightly encrypted `pg_dump` kept 30 days as a GitHub artifact. Does nothing until you add the `PRODUCTION_DB_URL` and `BACKUP_PASSPHRASE` secrets. Uploaded photos are not in it.
- **`docs/launch-checklist.md`**: decisions, accounts, schedulers, content, a smoke test and search-engine steps.

## Not done yet

- **Funnel analytics** (signup → first item → first match request → group joined → goal completed → story posted): waiting on the choice of tool.
- **Privacy policy and terms** pages: TODO, need the actual legal text.

## Migrations

None in this increment.

## What to test

1. `npx supabase db reset && npm run seed:demo`, then sign up: Explore, goal pages and the home feed show demo people and stories; your own matches list has none of them.
2. Press Tab on any page: "Skip to content" appears; Enter moves to the main content.
3. Open `/en/goals/climb-mount-kilimanjaro/opengraph-image` to see a share card.
4. Run with `ALLOW_INDEXING=true` and check `/robots.txt` and `/sitemap.xml`; without it robots.txt says `Disallow: /`.
5. With a Sentry DSN set, call the test-error endpoint (above) and check the error in Sentry has no email or cookie in it.
