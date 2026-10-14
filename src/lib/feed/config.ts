/**
 * Home feed ranking: the one place to tune it. Sent to the Postgres function
 * `home_feed` (supabase/migrations/20261014000008_social.sql), which has the
 * same defaults. Every item in the feed shows its reason, so the ranking stays
 * explainable:
 *
 *   story score = (follow + group + onList + min(reactions x reaction, reactionCap))
 *                 x 0.5 ^ (age in hours / halfLifeHours)
 *   new group   = newGroup x 0.5 ^ (age in hours / halfLifeHours)
 *   trending    = trending / rank   (1st, 2nd, 3rd most added this month)
 *
 * A story needs at least one of: you follow the author, it was posted in one
 * of your groups, or its goal is on your list.
 */
export const FEED_CONFIG = {
  weights: {
    /** You follow the author. */
    follow: 3,
    /** Posted in one of your groups. */
    group: 3,
    /** The story's goal is on your list. */
    onList: 1,
    /** Per reaction on the story (capped by reactionCap). */
    reaction: 0.2,
    /** A new, open group for a goal on your list. */
    newGroup: 2,
    /** The most-added goal this month (2nd gets half, 3rd a third). */
    trending: 1.5,
  },
  reactionCap: 2,
  /** Everything loses half its score every this many hours. */
  halfLifeHours: 48,
  /** Only stories and groups from the last this many days. */
  windowDays: 30,
  maxNewGroups: 5,
  maxTrending: 3,
} as const;

/** Items per page of the feed. */
export const FEED_LIMIT = 30;
