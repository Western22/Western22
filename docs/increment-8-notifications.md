# Increment 8: notifications

## What I built

- **Notification center.** A bell in the header shows the unread count, and it updates live (Supabase Realtime, limited to your own notifications by RLS). Tapping it opens `/en/notifications`: newest first, unread ones highlighted, "Mark all as read", and "Show older" for more. Opening a notification marks it read and takes you to the right place.
- **What creates a notification.** Database triggers fire on the real events, so nothing in the app can forget to notify:

  | Type | When | Goes to |
  | --- | --- | --- |
  | New match | Someone adds a goal you have, and matching would show them to you | Your matches for that goal |
  | Buddy request | Someone sends you a "Let's do this together" request | Requests |
  | Request accepted | Someone says yes to your request | Requests |
  | Group message | A message in one of your groups (bundled per group) | The group chat |
  | Plan vote needed | Someone proposes dates in your group | The group plan |
  | Date approaching | A week and a day before your group's leading date (planning or confirmed groups) | The group plan |
  | Story reactions | Reactions on your story (bundled per story) | The story |

  Blocked people never notify you. Reading the chat clears its message notification, voting clears "vote needed", and a declined or cancelled request clears the request notification.
- **Bundling.** While a group message, story reaction, new match or vote notification is unread, new events bump its count instead of adding rows ("3 new messages in Kili crew", "Bo and 2 others reacted to your story"). Email and push for these wait 10 minutes so a burst becomes one message. If you read it in the app before then, nothing is sent. Chat sends at most one email per unread bundle.
- **Email through Resend.** One plain email per notification with a button to the right page, plus the **weekly "Your bucket list digest"** (Mondays from 09:00 local time): up to 5 people who added one of your goals that week and up to 3 inspiring stories about your goals or from people you follow. Empty digests aren't sent. Every email has:
  - "Turn off these emails" and "Pause all email" links. They work without signing in, and need a button press, so link scanners can't unsubscribe anyone.
  - One-click unsubscribe headers (`List-Unsubscribe` and `List-Unsubscribe-Post`) that Gmail and Apple Mail use.
- **Web push.** In Settings, "Turn on push" asks the browser for permission (only when tapped), registers `/sw.js` and saves the subscription. Pushes are encrypted and signed with the web-push library. A newer bundle replaces the older one on the device. Subscriptions the browser vendor reports as gone are deleted.
- **Preferences.** Settings has a Notifications section: In app / Email / Push switches for each type (the digest is email only), quiet hours, time zone and "Pause all email". Defaults:
  - In app: everything on.
  - Push: everything on (once you turn push on).
  - Email: requests, accepted requests, dates to vote on, date reminders and the weekly digest. Chat, reactions and new matches are off, since the digest covers matches.
- **Quiet hours and time zones.** Quiet hours are wall-clock times in your own time zone and can wrap midnight (for example 22:00 to 07:00). Email and push that fall inside them wait until they end; in-app notifications still appear. The browser reports its time zone once, and you can change it in Settings.

## How sending works

Triggers write notifications and queue email/push rows in an outbox (`notification_deliveries`) that only the server can read. A scheduler calls `POST /api/cron/notifications` with `Authorization: Bearer $CRON_SECRET` every minute or few. Each run:

1. queues date reminders and weekly digests;
2. claims due deliveries. The database re-checks preferences, read state and quiet hours at this point, so a change made after queueing still counts;
3. sends them and reports back. Failures retry twice (after 5 and 10 minutes). If email or push isn't configured, deliveries are skipped rather than piling up.

It's safe to run often or twice at once (claims use `SKIP LOCKED`).

## Migration to run

`supabase/migrations/20261014000010_notifications.sql`. It adds:

- **Tables:** `notifications`, `notification_preferences`, `notification_settings`, `push_subscriptions` and `notification_deliveries`, all with RLS. People only ever see their own; nobody but the server sees the outbox.
- **Triggers:** on `bucket_items`, `match_requests`, `group_messages`, `group_date_options`, `group_date_votes` and `story_reactions`.
- **Changed:** `mark_group_read` now also clears the chat notification.
- **Realtime:** `notifications` is added to the realtime publication.

Locally: `npx supabase db reset`. Hosted: `npx supabase db push`.

**New dependency:** `web-push` (you approved it), plus `@types/web-push` for development. It's free, with no account needed.

## Setup for production

Set these in your host:

- `CRON_SECRET`: any long random string.
- `RESEND_API_KEY` and `EMAIL_FROM`: a sender on a domain you verify in Resend. Resend's free tier covers 3,000 emails a month (100 a day); beyond that is a paid plan, so check with me before upgrading.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (for example `mailto:you@yourdomain.com`). Generate the keys once with `npx web-push generate-vapid-keys`.
- `SUPABASE_SECRET_KEY` (already needed since increment 7) and `NEXT_PUBLIC_SITE_URL` (used for links in emails).

Then schedule the sender. Either of these works, and both are free:

- **Supabase pg_cron + pg_net** (Database > Extensions, enable both), then in the SQL editor:
  ```sql
  select cron.schedule('send-notifications', '* * * * *', $$
    select net.http_post(
      url := 'https://<your-domain>/api/cron/notifications',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
    );
  $$);
  ```
- **Vercel Cron** in `vercel.json`. Vercel's free plan only runs crons once a day, which is too slow for bundled chat, so prefer pg_cron there.

## What to test

1. As A and B, add the same goal. A's bell shows 1 without reloading. Open it: "B added … too", and tapping it opens your matches.
2. As A, send B a request. Run the sender locally:
   `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/notifications`.
   B's email arrives in Mailpit (http://127.0.0.1:54324). Its button opens Requests, and its "Turn off these emails" link unsubscribes after a button press.
3. As B, go to Settings > Notifications. Turn on chat emails, set quiet hours, save and reload; the settings stick.
4. In a group, send three messages as A. B sees "3 new messages in …" once. Opening the chat clears it.
5. Turn on push in Chrome (it needs the VAPID keys and HTTPS, or localhost), then have someone message your group.

## Checks run

- Typecheck, lint and production build pass.
- New database test `supabase/tests/notifications_test.sql`. It and the other five pass via `supabase/tests/run_all.sh`. It covers:
  - each trigger and bundling;
  - read-clearing (chat, votes, answered requests);
  - blocks;
  - preferences, defaults and quiet hours (same-day and overnight, in New York time);
  - claiming, finishing and retrying deliveries, and removing expired devices;
  - signed-out unsubscribe;
  - date reminders sent once;
  - digest content and empty digests skipped;
  - export, and who can read what.
- New two-person browser run at phone size covers:
  - the live bell and the center;
  - email arriving in Mailpit with one-click headers;
  - unsubscribing;
  - push encrypted, VAPID-signed and decrypted by a stand-in push service, with an expired device removed;
  - settings saving;
  - bundled chat;
  - the digest email.

  No page errors and no horizontal scrolling. The earlier browser runs still pass.

## Small changes elsewhere

- "My list" in the header is icon-only on phones so the bell fits at 390 px.
- "Download my data" now includes notification settings, preferences and notifications (not the unsubscribe token).
- `/sw.js` skips the locale redirect.

## Not built yet

- Notifications for comments, new followers and join requests (`TODO(notifications)`).
- Translated emails: emails use the recipient's profile locale, and only English exists today.
- New-match notifications for items added during onboarding, before the person finishes it. They still show up in matching and the digest.
- A "Test push" button in Settings.
