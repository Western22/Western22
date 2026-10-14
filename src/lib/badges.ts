import type { BadgeSlug } from "@/lib/supabase/database.types";

/**
 * Badges are computed in the database by badges_for() from public data, so
 * they're always true. The owner's user_badges rows only remember which
 * badges have already been celebrated, so each milestone is shown once.
 * Rules (see supabase/migrations/20261014000008_social.sql):
 *   first_dream 1+ goal · big_dreamer 10+ goals · doer 1+ done · unstoppable 5+ done
 *   first_group joined a group · team_player completed a goal with a group
 *   storyteller posted a story · globetrotter done goals in 5+ countries · polyglot 3+ languages
 */
export const BADGES: readonly BadgeSlug[] = [
  "first_dream",
  "big_dreamer",
  "doer",
  "unstoppable",
  "first_group",
  "team_player",
  "storyteller",
  "globetrotter",
  "polyglot",
];

/** Decorative emoji per badge (not translated). */
export const BADGE_EMOJI: Record<BadgeSlug, string> = {
  first_dream: "🌱",
  big_dreamer: "🌠",
  doer: "✅",
  unstoppable: "🔥",
  first_group: "🤝",
  team_player: "🏔️",
  storyteller: "📖",
  globetrotter: "🌍",
  polyglot: "🗣️",
};

/** Badges in display order. */
export function sortBadges(badges: BadgeSlug[]): BadgeSlug[] {
  return BADGES.filter((b) => badges.includes(b));
}
