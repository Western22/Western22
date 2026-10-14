# Increment 3: bucket list, goal pages, Explore

## What I built

- **Adding items from free text** (`/en/items`). As you type, suggestions come from the goal catalogue in any language. If you don't pick one, the server matches your text:
  1. Exact match after removing case and accents ("see the NORTHERN lights").
  2. Close match by trigram similarity, with a threshold of 0.6. For example, "climb kilimanjaro" matches Climb Mount Kilimanjaro, but "eat pizza in rome" does not match Eat pizza in Naples.
  3. Otherwise a new goal is created, waiting for review. Only its creator can see it until a moderator approves it.

  The confirmation says which of these happened. Your wording is saved as an alias, so future matching gets better.
- **Item details**, editable at any time under "Details" on each item:
  - When: this year, in 1–3 years, someday.
  - Flexibility: fixed, somewhat flexible, very flexible.
  - Budget: under $500, $500–2,000, $2,000–5,000, $5,000+, or not sure.
  - Status: dreaming, planning, done.
  - Privacy: everyone, buddies only, only me.
- **Buddies only** means people you follow who follow you back. The database enforces it. There's no follow button yet, so for now these items are visible only to you.
- **Goal pages** (`/en/goals/<slug>`):
  - Category artwork, title, place and description.
  - How many people want it and how many have done it.
  - Best months to go.
  - An "Add to my list" or "On your list" button.
  - "Top stories" and "Open groups" sections, which show empty states until those features exist.

  A pending goal shows a review banner to its creator and "not found" to everyone else.
- **Explore** (`/en/explore`):
  - Tabs for Popular, Trending (most added in the last 30 days) and Near me (goals within 1,500 km of your approximate home).
  - Category chips, plus Region and Best time (Dec–Feb, Mar–May, Jun–Aug, Sep–Nov) filters.
  - 24 goals per page.

  The filters live in the URL, so a filtered view can be shared.
- **212 seeded goals** across 11 categories (travel, adventure, nature, learning, creative, food, giving back, personal growth, culture, sport, social) and 9 regions. 136 of them have a place on the map, and about 45 extra aliases cover other languages and phrasings.

## Migrations to run

- `supabase/migrations/20261014000004_bucket_list.sql`:
  - Adds the item detail columns and the third privacy level.
  - Adds the follows table, plus region, season and photo fields on goals.
  - Updates `add_bucket_item` with fuzzy matching, and adds `explore_goals`, `goal_details` and `goal_counts`.
  - Drops the old item category column.
- `supabase/migrations/20261014000005_seed_goals.sql`: the goal catalogue.

Locally, run `npx supabase db reset`; on a hosted project, run `npx supabase db push`.

## What to test

1. On My list, type "climb kilimanjaro" without picking a suggestion. Open Details, set "This year", a budget and "Buddies only", then add it. You should be told it matched Climb Mount Kilimanjaro.
2. Add something unusual. You should get the "new one, we'll review it" message and see "Waiting for review" on the item.
3. Open Details on an item, change the status to Planning, and save.
4. Click the item to open its goal page, then add another goal from a goal page.
5. On Explore, try Food plus Africa, Europe plus Dec–Feb, Trending, and Near me (it needs a home city or a shared location).

## Checks run

- Typecheck, lint and production build pass.
- The database test passes. It covers fuzzy matching, the near-miss case, item details validation, buddies-only visibility with one-way and mutual follows, Explore filters and sorting, and goal page visibility.
- The browser runs at phone size pass for the new flows, and the onboarding and age-gate runs still pass. There were no page errors.

## Not built yet

- Follow button (needed for "Buddies only" to reach anyone).
- Stories and groups on goal pages.
- Real goal photos. They need a licensed photo source, for example the free Unsplash API with attribution, or photos you provide.
- A moderation screen for pending goals.
