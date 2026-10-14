# Increment 7: trust and safety

## What I built

- **Phone verification and a badge.** In Settings (`/en/settings`) you type your number, get a 6-digit code by SMS and enter it. Profiles then show a "Phone verified" badge. The number itself stays in Supabase Auth and is never shown to anyone.
  - A database trigger sets `phone_verified_at` when Auth confirms the number, so nobody can mark themselves verified from the browser.
  - **ID verification** is a hook for later: `src/lib/verification/id-provider.ts` defines the interface, and `set_id_verified()` in the database can only be called with the server's secret key. `TODO(id-verification)` describes the Stripe Identity flow (create a session, redirect, webhook, then call `set_id_verified`). The badge already says "ID verified" when that column is set.
- **Report and block.** A Report button is on profiles, chat messages, stories, comments and group pages. You pick a reason (spam, harassment, hate, inappropriate, scam, safety, under 18, other) and can add details. For a person or their content, "Also block {name}" blocks them in the same step. Groups can be reported but not blocked; blocking is for people. The form tells people to call local emergency services if they're in danger.
  - You can report something once, can't report yourself, and can't report things you can't see.
  - A chat message reported by 3 people is hidden, as before.
- **Moderation queue** at `/en/admin/moderation` (moderators only; everyone else gets "not found"). One card per reported thing, most reported first, showing the content, who posted it, reasons, details, any automatic flag, and the person's past warnings or suspension. Actions:
  - **Dismiss** closes the reports.
  - **Warn** sends the person a message they see at the top of every page until they tap "I understand".
  - **Remove** hides a chat message or deletes a story, comment or group (with a confirm step).
  - **Suspend** for 1, 7 or 30 days or forever (with a confirm step), and **Unsuspend**. A suspended person sees a banner, can still read, and can't post, message, follow or join. Their sign-in is also banned for the same period.
  - Every action is logged in `moderation_actions` with a copy of the content, and the Actioned and Dismissed tabs show past items.
- **Automatic text checks** on chat messages, stories, comments and group names and descriptions, in two layers:
  - **In the database** (`moderation_terms`): a short list of clear threats is blocked outright ("This breaks our community guidelines, so it wasn't posted"), and common scam phrases (Western Union, gift cards, "send me money"…) are posted but flagged for moderators.
  - **In the app** (`src/lib/moderation/`): `moderateText()` calls the provider named in `MODERATION_PROVIDER`. The default, `heuristics`, is free and local: lots of links, all caps, repeated characters and scam patterns. It only ever flags for review, never blocks. If a provider fails, the post goes through. Adding an external classifier is one file (`TODO(moderation-provider)`).
  - Each thing gets at most one automatic flag in the queue, however many layers catch it.
- **Meetup safety.**
  - "Before you meet" tips appear on a group's Plan tab once it's Planning or Confirmed, and on Requests once you have an accepted request, until you tap "Got it". The full list is on the guidelines page (`/en/guidelines#meeting-safely`).
  - The Plan tab says "Tip: meet first in a public place" under the location.
  - **Share my plan:** on the Plan tab you name a trusted contact (for example "Mum"), pick how long the link lasts (3, 7, 14 or 30 days) and get a link to copy, text or email. The contact sees the goal, group, status, typed location, proposed dates and first names, with no sign-in. You can revoke a link any time. Only the label you typed is stored, never their number or email.
- **Rate limits** in the database: 20 messages a minute and 500 a day, 60 follows an hour, 20 reports a day and 10 active share links. People see a plain message when they hit one. (Story and comment limits from increment 6 stay.)
- **Privacy controls** in Settings:
  - "Hide me from matching" removes all your items from everyone's matches.
  - "Approximate location only" moves your home point to a ~25 km grid instead of ~5 km.
  - "Download my data" gives a JSON file with your account email and phone, profile, settings, snapped location, items, follows, blocks, requests, groups, your messages, stories, comments, reactions, reports you made, warnings and share links.
  - "Delete my account" asks you to type your username. It hands groups you own to the next member, removes your photos from storage, deletes the account and everything that hangs off it, and signs you out.
- **Community guidelines** at `/en/guidelines`, linked from the footer on every page: be real; be kind and respectful; no scams, spam or selling; respect privacy; meeting up safely; nothing illegal or dangerous; and reporting and what happens next.

## Migration to run

`supabase/migrations/20261014000009_trust_safety.sql`. It adds:

- **Tables:** `profile_settings`, `account_status`, `user_warnings`, `reports`, `moderation_terms`, `moderation_actions` and `plan_shares`, each with RLS.
- **Profiles:** `phone_verified_at` and `id_verified_at`, which only the database can set.
- **Reports:** the old `message_reports` rows are copied into `reports`, then `message_reports` is dropped. `report_message()` still works as a wrapper.
- **Triggers:** suspended people can't insert into items, follows, requests, groups, members, join requests, messages, date options, checklist items, stories, comments or reactions. Text checks run on messages, stories, comments and groups. Message and follow rate limits.
- **Changed functions:** `set_my_location` (approximate grid) and `item_matchable_by` (skips hidden and suspended people).

Locally, run `npx supabase db reset`. On a hosted project, run `npx supabase db push`.

`supabase/config.toml` also changes: phone confirmations are on, there's a local test number (`+1 555 555 0100`, code `123456`), and Twilio is enabled with dummy values so the local stack accepts phone changes. Restart the local stack (`npx supabase stop` then `start`) to pick that up.

### Before going live

- **SMS provider (paid).** Phone verification needs one in Supabase (Auth > Providers > Phone, e.g. Twilio or MessageBird), and **"Confirm phone" must be on**. Without it Supabase marks any number as verified without sending a code. `TODO(sms)`.
- **`SUPABASE_SECRET_KEY`** (server only) in your host. Without it, "Delete my account" shows "not available yet" and suspensions don't ban sign-in (the database still blocks posting).
- Add moderators with `insert into public.moderators (user_id) values ('<uuid>');`.

## What to test

1. Locally, sign in, open Settings, enter `+1 555 555 0100`, tap "Send code", then enter `123456`. Your profile shows "Phone verified".
2. In a group chat, send "I will kill you". It's refused. Send "pay the deposit by Western Union". It's posted.
3. As another member, tap Report on that message, pick Scam, tick "Also block" if you like, and send. Report the person's profile too.
4. As a moderator, open `/en/admin/moderation`. The message shows 2 reports and "Flagged automatically". Warn on the message, then suspend the person from the profile card for 7 days.
5. As the suspended person, reload. You see the suspension and warning banners, and sending a message says your account is suspended. Tap "I understand" on the warning.
6. Move a group to Planning. The safety tips show on the Plan tab; tap "Got it". Create a "Share my plan" link, open it in a private window, then revoke it and reload.
7. In Settings, turn on "Hide me from matching" and "Approximate location only", save, and tap "Download my data".
8. Delete a test account by typing its username. You land on the home page with "Your account has been deleted", and the profile link shows not found.

## Checks run

- Typecheck, lint and production build pass.
- A new database test (`supabase/tests/trust_safety_test.sql`) passes, and so do the RLS, matching, groups and social tests (`supabase/tests/run_all.sh` runs all five). It covers:
  - phone verification sync, and that nobody can set verification themselves;
  - blocked and flagged text, and one automatic flag per item;
  - report rules, who can read reports and the queue;
  - the message rate limit;
  - dismiss, remove, warn and suspend, the audit log, and that a moderator can't suspend themselves;
  - what a suspended person can and can't do, and that they drop out of matching;
  - hide from matching and the approximate grid;
  - share links (private to their owner, readable by the link, revocable);
  - the data export, and account deletion handing a group to the next member.
- A new four-person browser run at phone size covers everything in "What to test" above, with no page errors and no horizontal scrolling. The groups, social, matching, bucket-list, onboarding, age-gate and location runs still pass; the groups run uses the new report form.

## Small changes elsewhere

- Chat now uses the shared Report form (reasons, details, also block) instead of the one-tap reasons menu.
- Error messages for suspensions, blocked text and rate limits are shared in `src/lib/db-errors.ts`.
- `/api/` routes skip the locale redirect.

## Not built yet

- ID verification itself (`TODO(id-verification)`).
- An external moderation classifier (`TODO(moderation-provider)`). The database term list is a small English starter set (`TODO(moderation)`), and pending goals aren't in the queue yet.
- Appeals for warnings and suspensions, and emails telling people about them.
- Reporting photos inside chat separately from their message.
