# Increment 2: auth and onboarding

## What I built

- **Sign-in** (`/en/login`): one page for new and returning users. Email magic link, plus Google and Apple buttons that appear only when listed in `NEXT_PUBLIC_AUTH_PROVIDERS`. No passwords. `/signup` now redirects here.
- **Age gate**: an "I confirm I'm 18 or older" tick is required before any sign-in option works. It is recorded on the profile (`adult_confirmed_at`), and the database refuses to finish onboarding without it. Anyone who arrives unconfirmed (for example a first-time Google user) sees a short age screen first; choosing "I'm under 18" signs them out with a message.
- **Onboarding** (`/en/welcome`), five screens with a progress bar, each one saving as you go and skippable:
  1. Name and photo (cropped and resized in the browser, which also strips GPS data from the photo).
  2. Home city, country, "use my approximate location", and languages (pre-filled from the browser).
  3. Interests (24 options) and travel style as picture cards (solo, budget, luxury, adventure).
  4. "Add your first 3 dreams": tap featured goals or search in any language ("aurora boreal" finds "See the Northern Lights"), or add your own. Three stars light up as you go.
  5. A celebration screen linking to your public profile.
- **Public profile** (`/en/u/<username>`): photo, name, bio, home city label, languages, interests, goals completed, goals on the list, badges and the active public list. Visible to signed-out visitors; never shows location, email or phone.
- **Badges** (computed from stats): First dream, Big dreamer (10+ goals), Doer (first completion), Unstoppable (5+ done), Polyglot (3+ languages).
- **Edit profile** now has bio, language, interest and travel-style pickers, plus a link to the public profile.
- **Privacy**: the home point is snapped to a grid about 5 km wide inside the database before it is stored, and only its owner can read it.
- **Canonical goals** from the design doc: every bucket item now links to a goal. Typed goals that match nothing become "pending" goals for moderators.

## Migration to run

`supabase/migrations/20261014000003_onboarding_and_goals.sql`, applied with `npx supabase db reset` locally or `npx supabase db push` on a hosted project. It adds the profile fields, the goals tables seeded with 20 featured goals, the avatars storage bucket, the moderators table, and the RPCs. Existing bucket items are backfilled to goals.

## What to test

1. Open `/en/login`, enter an email without ticking 18+ and check that you get an error. Tick it and send the link.
2. Open the email in Mailpit (http://127.0.0.1:54324), click the link, and you should land on onboarding.
3. Upload a photo, then go through all the screens. Try "Use my approximate location", searching "aurora boreal", and adding your own goal.
4. Finish, then check your public profile, and open it again in a private window while signed out.
5. Revisit `/en/welcome` and check that it sends you to your profile.

## Checks run

- `tsc`, lint and production build all pass.
- The database test (`supabase/tests/rls_test.sql`) prints ALL RLS CHECKS PASSED. It covers location snapping, cross-language goal matching, blocked direct inserts, the age gate, and hidden aliases.
- Two browser runs passed on a phone-sized screen against local Supabase:
  - The full magic-link flow through onboarding to the public profile, with no page errors. It also confirmed that no coordinates appear in the page HTML.
  - The unconfirmed-user path (age screen, then under 18, then signed out).

## Decisions I defaulted

From the design doc: items always link to a goal (a pending goal is created when nothing matches), and moderators are kept in an allowlist table. The group-size cap (2 to 12, default 6) isn't built yet.
