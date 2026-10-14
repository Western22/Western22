/**
 * Matching tuning: the one place to change how buddies are ranked.
 *
 * These values are sent to the Postgres function `find_matches` on every call
 * (see supabase/migrations/20261014000006_matching.sql). The SQL has the same
 * numbers as defaults, so the function still works if a key is missing.
 *
 * Each component scores 0..1 and the final score is the weighted average,
 * shown as 0..100. Weights are relative: doubling all of them changes nothing.
 */
export const MATCH_WEIGHTS = {
  /** Same timeframe = 1, neighbouring (this year vs 1–3 years) = 0.5, otherwise 0.2; +0.2 if either is very flexible. */
  timeframe: 25,
  /** Closer homes score higher. For worldwide goals everyone gets at least half. */
  distance: 20,
  /** Shared languages: 1 shared = 0.5, 2 or more = 1. */
  languages: 20,
  /** Overlap of travel styles (solo, budget, luxury, adventure). */
  travelStyle: 10,
  /** Same budget range = 1, neighbouring = 0.5, unknown = 0.3. */
  budget: 15,
  /** Recently active people rank higher. */
  recency: 10,
} as const;

export const MATCH_CONFIG = {
  weights: MATCH_WEIGHTS,
  /** Distance at which the distance score drops to 0.5. */
  distanceHalfKm: 100,
  /** A goal with a fixed place farther than this from you counts as "worldwide". */
  worldwideKm: 300,
  /** Days of inactivity after which the recency score halves. */
  recencyHalfLifeDays: 30,
} as const;

/** How many matches to show for one item (the database caps it at 50). */
export const MATCH_LIMIT = 30;

/** Longest note on a "Let's do this together" request (also enforced in the database). */
export const MATCH_NOTE_MAX = 280;
