# Increment 9: going global

## Languages (next-intl)

- **next-intl** (you approved it) now loads each request's messages and formats them with ICU MessageFormat, so translations can use plural forms (`{count, plural, one {…} few {…} other {…}}`) with the right rules for each language. `format(message, values, locale)` in `src/i18n/format.ts` wraps it; the existing `{name}` placeholders work unchanged.
- **Seven new message files** in `src/i18n/messages/`: Spanish, Portuguese, French, German, Polish, Hindi and Japanese. Each has the header, menus, error pages and Translate button translated so far; anything missing falls back to English key by key, so a language can be finished gradually.
- **Live vs. in progress.** `liveLocales` in `src/i18n/config.ts` lists the languages offered in Settings and picked from the browser's language. It's English only until the other files are complete and checked by a native speaker. The others still open by URL (`/es`, `/ja`) for translators.
- **Strings.** All user-facing text was already in `en.ts`; the last two hardcoded pages (error and not found) now come from it too. Unknown URLs like `/ja/nope` show the translated not-found page.
- **To finish a language:** copy the missing keys from `en.ts` into its file, translate, have it reviewed, then add its code to `liveLocales`.

## Translate button, currencies and units

- **Translate button** on other people's stories, comments and group chat messages, for signed-in readers. It translates into the language you're reading the app in and shows "Translated from Spanish · Show original".
  - **Pluggable.** `TRANSLATION_PROVIDER` picks `deepl` (default, your choice), `google` or `libretranslate`. Each is one small adapter in `src/lib/translation/`; adding another service means one more adapter.
  - **Only where it works.** The button shows only when a service is configured and supports your language, checked against the service's own language list (DeepL's `/v2/languages?type=target`, refreshed daily). No key, no button.
  - **Private and safe.** The browser sends only the content's id. The server reads the text with your own permissions, so chat stays members-only and the button can't be used to translate arbitrary text. Messages hidden by moderators aren't translated.
  - **Cached.** Each text is translated once per language and stored by a fingerprint (sha256) of the text, not by who wrote it. The cache is server-only, so nobody can plant a fake translation.
  - **Limits.** 60 translations an hour and 20,000 new characters a day per person. Cached translations only count toward the hourly number.
- **Budgets in your currency.** Bucket-list budget ranges are stored in US dollars and now show in each person's currency, rounded and marked approximate: "≈€460–€1,800" for someone in Germany. The group plan also shows "That's ≈¥140,000 per person in your currency" when the group's budget is in another currency.
- **Distances in km or miles.** Match reasons and Explore's "Near me" use miles for people in the US, UK, Liberia and Myanmar, kilometres elsewhere, formatted for the reader's language.
- **Exchange rates.** The European Central Bank's free daily reference rates (no account needed). `/api/cron/exchange-rates` fetches them once a day and also clears old translation-usage rows. If a currency has no rate, amounts stay in US dollars.
- **Settings > Language and region.** Language, currency and distances. "Automatic" uses your home country, shown in brackets, for example "Automatic (EUR)". The language list shows live languages only; choosing one saves it on your profile and in the language cookie.
- **Right-to-left ready.** Layouts now use direction-neutral spacing and positions, back arrows flip in right-to-left pages, and `<html dir>` is set from the language. Arabic and Hebrew will only need their message files.

## Migration to run

`supabase/migrations/20261014000011_localization.sql` (locally `npx supabase db reset`, hosted `npx supabase db push`). It adds:

- `profile_settings.currency` and `profile_settings.units` (empty means automatic), and the `update_region_settings` function. Only the owner can read or change them.
- `exchange_rates`: readable by everyone, written only by the server.
- `content_translations` (the cache) and `translation_usage` (for limits): no access from the app at all, only the server's secret key.
- `translation_allowed` and `prune_translation_usage`, callable only by the server.

**New dependency:** `next-intl` (free, open source).

## Setup for production

- **DeepL.** Create a DeepL API account (the free plan covers 500,000 characters a month; beyond that is paid, so check with me before upgrading). Set `DEEPL_API_KEY`. Free keys end in `:fx` and use DeepL's free endpoint automatically.
- **Exchange rates.** Schedule `POST /api/cron/exchange-rates` with `Authorization: Bearer <CRON_SECRET>` once a day, after 16:00 CET when the ECB publishes. With pg_cron:
  ```sql
  select cron.schedule('exchange-rates', '30 15 * * *', $$
    select net.http_post(
      url := 'https://<your-domain>/api/cron/exchange-rates',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
    );
  $$);
  ```
  Vercel's free daily cron also works for this one. Run it once by hand after deploying, so budgets convert from day one.
- `SUPABASE_SECRET_KEY` (already needed) is required for the translation cache.

## What to test

1. Run the rates job once: `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/exchange-rates`.
2. Set your home country to Germany on your profile, then open My list. A budget of $500–2,000 shows as "≈€460–€1,800".
3. In Settings > Language and region, choose Japanese yen and Miles, then save. My list shows yen.
4. With `DEEPL_API_KEY` set, have someone post a story or comment in Spanish. Press Translate under it, then Show original.
5. In a group chat, press Translate under someone else's message.
6. Open `/es` or `/ja`: the menus are translated and the rest is English. `/ja/nope` shows the Japanese not-found page.

## Checks run

- Typecheck, lint and production build pass.
- New database test `supabase/tests/localization_test.sql` covers region settings (own row only, validation), exchange-rate permissions, the cache and usage tables being closed to the app, the hourly and daily limits, pruning, and account deletion. It and the six earlier tests pass via `supabase/tests/run_all.sh`.
- New browser run at phone size (`.harnesskit/e2e/global.mjs`, with a local stand-in for DeepL and the ECB): rates refresh, euro and yen budgets, saving region settings, Spanish, Polish and Japanese pages with English fallback and the translated not-found page, translating a story (and serving it from the cache the second time), a comment and a chat message, "already in your language", the hourly limit, no button for authors or signed-out visitors, and every main page flipped to right-to-left without horizontal scrolling. No page errors. The earlier browser runs still pass.

## Not built yet

- Full translations of the seven new languages (each needs a native-speaker pass before going live).
- Translated notification emails (they follow once the languages exist).
- Translating goal titles: they already have per-language titles in the database (`goal_translations`).
- Converting amounts typed into the group plan's budget field: the field keeps the group's own currency, and only the summary line converts.
