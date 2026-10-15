# Going live: first production setup

Production runs on one Supabase project, **buddies-staging** (`ucgzjhnazhyysfrjfary`, Frankfurt). Only two free projects are allowed per account, so there is no separate staging yet. The name is only a label; rename it in Supabase > Project Settings > General if you like. The database is already set up: all 13 migrations, the 212 goals, row-level security on every table, and the storage buckets.

## 1. Import the app into Vercel

1. Open https://vercel.com/new and pick **Western22/western22**. If it isn't listed, click "Adjust GitHub App Permissions" and allow it.
2. Project name: `buddies`. Framework: Next.js (detected). Leave the build settings as they are.
3. Open **Environment Variables** before you click Deploy, and add the ones below.

## 2. Environment variables (Production)

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ucgzjhnazhyysfrjfary.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable__XkyPxYGchtuTcSmjHz4fw_6685n0Z0` (safe to share; row-level security protects data) |
| `SUPABASE_SECRET_KEY` | Supabase > Project Settings > API Keys > **Secret keys** > copy the default key |
| `NEXT_PUBLIC_SITE_URL` | `https://buddies.vercel.app` (change it after the first deploy if Vercel gives a different address) |
| `CRON_SECRET` | any long random text, 40 or more characters (a password manager can generate one) |
| `NEXT_PUBLIC_SENTRY_DSN` | your Sentry DSN |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` |
| `RESEND_API_KEY` | your Resend key |
| `EMAIL_FROM` | `Buddies <onboarding@resend.dev>` for now (see step 4) |
| `DEEPL_API_KEY` | your DeepL key (ends in `:fx`) |

Leave `ALLOW_INDEXING` out for now. Adding `ALLOW_INDEXING=true` later is the moment search engines start listing the site.

Then click **Deploy**.

## 3. Tell Supabase where the app lives

Supabase > Authentication > URL Configuration:

- **Site URL:** your Vercel address, e.g. `https://buddies.vercel.app`
- **Redirect URLs:** add `https://buddies.vercel.app/auth/confirm**`

Without this, sign-in links point at localhost.

## 4. Email that reaches people

Until you verify a domain in Resend, Resend only delivers to your own Resend account address. Sign-in emails still go out through Supabase's built-in sender, but that's limited to a few emails an hour.

When you have a domain:

1. Resend > Domains > add it, then add the DNS records Resend shows you.
2. Change `EMAIL_FROM` to `Buddies <hello@yourdomain>`.
3. Supabase > Authentication > Emails > SMTP Settings: host `smtp.resend.com`, port `465`, user `resend`, password = your Resend key.

## 5. After the first deploy

These are done from here once the address is known:

- schedule the notification sender (pg_cron, every minute);
- run the smoke test;
- make the owner a moderator;
- optionally add the demo data.

Search engine indexing (`ALLOW_INDEXING=true`) is switched on last, with the owner's go-ahead.
