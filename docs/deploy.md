# Deploying: staging and production on Vercel

Two copies of the app, each with its own Supabase project, so tests on staging never touch real people.

| | Production | Staging |
| --- | --- | --- |
| Git branch | `main` | `staging` |
| Vercel environment | Production | Preview, scoped to the `staging` branch |
| Supabase project | `buddies-prod` | `buddies-staging` |
| Address | your domain, e.g. `https://example.com` | e.g. `https://staging.example.com` (or the Vercel preview URL) |
| Search engines | allowed (`ALLOW_INDEXING=true`) | blocked (leave `ALLOW_INDEXING` unset) |
| Demo data | yes (`npm run seed:demo -- --yes`) | yes |

Other branches still get Vercel preview deployments. Unless you give them their own variables they use the "Preview (all branches)" values, so point those at staging too, never at production.

## Costs to decide before launch (ask before upgrading)

- **Vercel Hobby (free) is for non-commercial use only.** If the app makes money (ads, subscriptions, sponsorship), Vercel's terms need the Pro plan (paid, per seat). Hobby also limits cron jobs to once a day, which is why the minute-by-minute notification sender runs from Supabase (below).
- **Supabase Free pauses a project after about a week with no activity and has no automatic backups.** Production on Free relies on the free nightly backup below. Supabase Pro (paid) adds daily backups, with point-in-time recovery as an extra. Staging can stay on Free.
- Sentry, Resend and DeepL all have free tiers that cover an early launch; check their limits on each dashboard.

## One-time setup

1. **Supabase projects.** Create `buddies-prod` and `buddies-staging` (same region as your Vercel functions, e.g. Frankfurt or US East). In each:
   - Database > Extensions: enable `postgis`, `pg_cron` and `pg_net`.
   - Apply the migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
   - Authentication > URL configuration: Site URL = the app address; add `https://<address>/auth/confirm**` to the redirect list (email links and social sign-in both return there).
   - Authentication > Emails: set up custom SMTP with Resend, so sign-in emails come from your domain.
   - Storage buckets come from the migrations; nothing to click.
2. **Vercel project.** Import the GitHub repository (framework: Next.js, defaults are fine). Settings > Git: production branch `main`. Create the `staging` branch in GitHub.
3. **Domains.** Add your domain to the Production environment and `staging.<domain>` assigned to the `staging` branch.
4. **Environment variables.** Add the table below in Settings > Environment Variables, once for Production and once for Preview with branch `staging`.
5. **Schedulers.** See "Scheduled jobs".
6. **Backups.** See "Backups".

## Environment variables

"Public" variables start with `NEXT_PUBLIC_`; they are baked into the browser code at build time, so redeploy after changing them. Never put a secret in a `NEXT_PUBLIC_` variable.

| Variable | Needed? | Production | Staging | What it is |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | yes | `https://example.com` | `https://staging.example.com` | Used for links in emails, canonical URLs, sitemap and share images. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | prod project URL | staging project URL | Supabase > Project Settings > API. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | prod publishable key | staging publishable key | Safe in the browser; RLS protects data. (`NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted for older projects.) |
| `SUPABASE_SECRET_KEY` | yes | prod secret key | staging secret key | Server only. Sends notifications, cron work, moderation. |
| `CRON_SECRET` | yes | long random string | a different one | Guards `/api/cron/*` and `/api/monitoring/test-error`. Vercel Cron sends it automatically. |
| `ALLOW_INDEXING` | prod only | `true` | unset | Lets search engines index public goal and story pages. Anything else adds `noindex` and a blocking robots.txt. |
| `RESEND_API_KEY` | for email | Resend key | Resend key (or unset) | Email notifications and the weekly digest. Unset = email is skipped. |
| `EMAIL_FROM` | for email | `Buddies <hello@example.com>` | `Buddies staging <staging@example.com>` | Sender on a domain verified in Resend. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | for push | generated | generated (separate pair) | Web push. Generate with `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | for push | generated | generated | Server only. |
| `VAPID_SUBJECT` | for push | `mailto:hello@example.com` | same | Contact address push services can reach. |
| `TRANSLATION_PROVIDER` | no | `deepl` (default) | `deepl` | Or `google` / `libretranslate`. |
| `DEEPL_API_KEY` | for Translate | DeepL key | DeepL key | Free keys end in `:fx`. Unset = the Translate button is hidden. |
| `GOOGLE_TRANSLATE_API_KEY`, `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY` | only if chosen | | | For the other translation providers. |
| `MODERATION_PROVIDER` | no | `heuristics` (default) | `heuristics` | Free built-in checks. |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | no | e.g. `google,apple` | same | Social sign-in buttons; each must also be enabled in Supabase Auth. |
| `NOMINATIM_URL` | no | unset | unset | Only if you self-host the city lookup. |
| `NEXT_PUBLIC_SENTRY_DSN` | for Sentry | prod project DSN | same DSN | Error reports from browser and server. Unset = Sentry is off. |
| `SENTRY_DSN` | no | | | Server-only override of the DSN. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | no | `production` | `staging` | Separates the two in Sentry. Defaults to Vercel's environment name. |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | recommended | from Sentry | same | Uploads source maps at build so errors show real file names. Without them builds still work. |

Test-only overrides, never set in Vercel: `DEEPL_API_URL`, `GOOGLE_TRANSLATE_URL`, `EXCHANGE_RATES_URL`, `MAILPIT_URL`.

## Scheduled jobs

| Job | How often | Where |
| --- | --- | --- |
| `POST /api/cron/notifications` (send email/push, date reminders, weekly digest) | every minute | Supabase pg_cron, see `docs/increment-8-notifications.md` |
| `GET /api/cron/exchange-rates` (currency rates, prune translation usage) | daily 15:30 UTC | `vercel.json` (Vercel Cron, works on Hobby) |

Vercel Cron only runs on the Production deployment. For staging, schedule the exchange-rate job with pg_cron in the staging project (SQL in `docs/increment-9-global.md`) if you need fresh rates there.

## Sentry

1. Create a Sentry project (platform: Next.js). Copy its DSN into `NEXT_PUBLIC_SENTRY_DSN`.
2. Create an auth token (Settings > Auth Tokens, scope `project:releases`) for `SENTRY_AUTH_TOKEN`, plus `SENTRY_ORG` and `SENTRY_PROJECT`.
3. After deploying, check it end to end:
   `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<address>/api/monitoring/test-error`
   returns 500 and an error "Sentry test error" appears in Sentry within a minute.

What is sent: the error, stack trace, page path and the user's id. What is never sent: email addresses, cookies, request bodies, sign-in tokens or links (`src/lib/monitoring/sentry-options.ts` strips them). Session replay is off.

## Backups

**Free option (set up now):** `.github/workflows/db-backup.yml` runs `pg_dump` every night at 03:15 UTC, encrypts the dump with a passphrase (AES-256) and keeps it as a GitHub Actions artifact for 30 days. It does nothing until you add two repository secrets:

- `PRODUCTION_DB_URL`: Supabase > Project Settings > Database > Connection string, "Session pooler" URI with the password filled in.
- `BACKUP_PASSPHRASE`: a long random passphrase. Keep a copy in a password manager; without it the backups cannot be opened.

Run it once by hand (Actions > Database backup > Run workflow) and check an artifact appears.

The dump covers the `public`, `auth` and `storage` schemas (people, sign-ins, data, and file records). **Uploaded photos themselves live in Supabase Storage and are not in the dump.**

**Paid option:** Supabase Pro takes daily backups automatically, and point-in-time recovery is an add-on. Ask before upgrading.

**Restoring** (practice this once on staging):

```sh
gpg --decrypt db-<date>.dump.gpg > backup.dump      # asks for the passphrase
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname "<target database connection string>" backup.dump
```

Restore into a fresh project first and check it before touching production.

## Releasing

1. Merge feature work into `staging`; Vercel deploys it. If there are new migrations, run `npx supabase db push` against staging first.
2. Check staging (see the launch checklist's smoke test).
3. Run `npx supabase db push` against production, then merge `staging` into `main`.
4. To roll back the app, use Vercel > Deployments > a previous deployment > Promote. Migrations do not roll back automatically, so keep them backwards compatible.
