# Increment 4: matching

## What I built

- **Find buddies** (`/en/items/<item>/matches`), from a link on each item and a button on goal pages. It ranks people who have the same canonical goal, best match first, and shows up to 30.
- **Scoring in Postgres** (`find_matches`). Each part scores 0 to 1, and the total is a weighted average shown as a percentage:
  - Timeframe: same = 1, neighbouring (this year vs 1–3 years) = 0.5, otherwise 0.2. Being very flexible adds 0.2.
  - Distance between homes. For goals tied to a place more than 300 km from you ("worldwide"), everyone gets at least half marks, because people meet there.
  - Shared languages: one shared = 0.5, two or more = 1.
  - Travel style overlap.
  - Budget: same range = 1, neighbouring = 0.5, unknown = 0.3.
  - Recent activity: halves every 30 days idle.
- **Tunable weights** in one file, `src/lib/matching/config.ts`. They're sent with every call, and the SQL keeps the same numbers as defaults.
- **Match cards**: photo, name, city, the score, and reason chips such as "Both aiming for 2026", "Speaks Spanish", "200 km away", "Under 25 km away", "Meet there from anywhere", "Also likes adventure travel", "Same budget" and "Active this week".
- **"Let's do this together"**: an optional note of up to 280 characters. The card then shows "Request sent", "They asked you", "You're buddies" or "Not this time".
- **Requests inbox** (`/en/requests`), reached from an inbox icon in the header that shows a count of new requests. It has three sections: Waiting for you (Accept / Decline), Doing it together, and Sent. Accepting makes the two of you buddies (mutual follows), so buddies-only items become visible to each other.
- **Block / Unblock** on public profiles. Blocking hides both people from each other's matches and inbox, removes follows, and cancels pending requests.

## Who is never shown

- People whose item is private. Buddies-only items show only to buddies.
- Anyone blocked, in either direction.
- People who already completed the goal, or haven't finished onboarding or the 18+ check.

Distances are rounded (under 25 km, then to the nearest 10, 50 or 100 km), and coordinates never leave the database.

## Limits

- 20 requests a day per person.
- One request per person per goal. If they already asked you, you're told to accept theirs instead.

## Migration to run

`supabase/migrations/20261014000006_matching.sql` adds:

- The `blocks` and `match_requests` tables.
- The functions `find_matches`, `send_match_request`, `respond_match_request`, `my_match_requests`, `block_user` and `unblock_user`.
- A change to `are_buddies` so blocked pairs are never buddies.

Locally, run `npx supabase db reset`; on a hosted project, run `npx supabase db push`.

## What to test

1. Sign in as two people in two browsers. Give both the same goal and Spanish in their languages.
2. As the first person, open My list and choose "Find buddies" on that item. You should see the other person with a score and reason chips.
3. Send "Let's do this together" with a note.
4. As the second person, check that the inbox icon shows 1. Open it and accept.
5. Back as the first person, reload: the card says "You're buddies".
6. As the second person, open the first person's profile and block them. The first person's matches page is now empty. Unblock to undo.
7. Set the item to private as the second person. They disappear from the first person's matches.

## Checks run

- Typecheck, lint and production build pass.
- The new database test (`supabase/tests/matching_test.sql`) passes, and the existing RLS test still passes. The new test covers:
  - Ranking and reasons.
  - Tunable weights.
  - The worldwide flag.
  - Exclusion of private, blocked (both ways), done, not-onboarded and non-buddy buddies-only items.
  - Send, duplicate, reverse, accept, decline and answer-twice cases.
  - Blocking cancelling requests and removing follows.
  - Re-asking after an unblock.
  - The rate limit.
  - No anonymous access.
- A two-person browser run at phone size covers the full flow (find, request, badge, accept, buddies, block, unblock). The earlier onboarding, age-gate, location and bucket-list runs still pass, with no page errors.

## Not built yet

- Email or push notifications for new requests. The header badge is the only signal for now.
- Starting a group when a request is accepted (`TODO(groups)`).
- A follow button (accepting a request is currently the only way to become buddies).
