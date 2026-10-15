# Launch checklist

Work top to bottom. Setup details are in `docs/deploy.md`.

## Decisions (need evans)

- [ ] Vercel plan: Hobby is non-commercial only; Pro is paid.
- [ ] Supabase plan for production: Free (pauses when idle, no automatic backups) or Pro (paid).
- [ ] Final app name and domain (replace "Buddies", `app.name` in `src/i18n/messages/en.ts`).
- [ ] Analytics tool for the signup-to-story funnel.

## Accounts and settings

- [ ] Supabase production and staging projects created; `postgis`, `pg_cron`, `pg_net` enabled; `npx supabase db push` run on both.
- [ ] Supabase Auth: Site URL and redirect URL set; custom SMTP through Resend; social providers enabled if used.
- [ ] Resend: sending domain verified (SPF/DKIM records added); `EMAIL_FROM` uses it.
- [ ] VAPID keys generated, separate pairs for staging and production.
- [ ] DeepL key added (free key ends in `:fx`).
- [ ] Sentry project created; DSN and source-map token added.
- [ ] Phone verification: either an SMS provider in Supabase Auth (paid, e.g. Twilio) with "Confirm phone" on, or leave phone verification unused. Without a provider Supabase marks any number verified.
- [ ] Vercel: production branch `main`, `staging` branch variables scoped, domains attached.
- [ ] All variables from the table in `docs/deploy.md` set for both environments.
- [ ] `ALLOW_INDEXING=true` set in **Production only**.

## Scheduled jobs and backups

- [ ] pg_cron job calling `/api/cron/notifications` every minute (production and staging).
- [ ] `vercel.json` exchange-rate cron listed under Vercel > Settings > Cron Jobs.
- [ ] GitHub secrets `PRODUCTION_DB_URL` and `BACKUP_PASSPHRASE` added; backup workflow run once by hand; artifact appears.
- [ ] Restore practiced once into staging.

## Content

- [ ] `npm run seed:demo -- --yes` run against production (needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` for production in your shell). Demo people are labelled "Example profile", use `@demo.invalid` emails and are hidden from matching.
- [ ] Community guidelines page reviewed (`/en/guidelines`).
- [ ] Privacy policy and terms written and linked in the footer. These pages do not exist in the app yet (TODO: needs the actual legal text).
- [ ] At least one moderator added (`insert into public.moderators (user_id) values (...)`), who can open `/en/admin/moderation`.

## Smoke test on staging, then production

- [ ] Sign up with email; magic link arrives from your domain; onboarding completes.
- [ ] Add a bucket-list item; matches appear; send and accept a request.
- [ ] Create a group, chat, vote on a plan, mark the goal done, post a story with a photo.
- [ ] Email and push notification arrive for a new request; quiet hours respected.
- [ ] Translate button works on a story in another language.
- [ ] Report a story; it appears in the moderation queue.
- [ ] `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<address>/api/monitoring/test-error` returns 500 and the error shows in Sentry.
- [ ] Phone check at 390px width: home, goal page, group chat.

## Search engines (production)

- [ ] `https://<domain>/robots.txt` shows `Allow: /` and the sitemap line (staging shows `Disallow: /`).
- [ ] `https://<domain>/sitemap.xml` lists goals and stories.
- [ ] A goal page's share preview looks right (paste the link in a chat app, or use a social card debugger).
- [ ] Domain added to Google Search Console and Bing Webmaster Tools; sitemap submitted.

## After launch

- [ ] Watch Sentry for new errors in the first days.
- [ ] Check the backup artifact appears each night.
- [ ] Check the Resend dashboard for bounces and spam complaints.
- [ ] Remove demo data once there are enough real people: `npm run seed:demo -- --remove --yes`.
