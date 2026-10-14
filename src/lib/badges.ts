/**
 * Badges are derived from profile stats on each view, so they're always
 * consistent with the data.
 * TODO(badges): persist awarded badges (with awarded_at) once we need
 * notifications or badges that can't be recomputed from current data.
 */

export const BADGES = ["first_dream", "big_dreamer", "doer", "unstoppable", "polyglot"] as const;
export type Badge = (typeof BADGES)[number];

export type BadgeInput = { activeCount: number; completedCount: number; languageCount: number };

const RULES: Record<Badge, (s: BadgeInput) => boolean> = {
  first_dream: (s) => s.activeCount + s.completedCount >= 1,
  big_dreamer: (s) => s.activeCount + s.completedCount >= 10,
  doer: (s) => s.completedCount >= 1,
  unstoppable: (s) => s.completedCount >= 5,
  polyglot: (s) => s.languageCount >= 3,
};

/** Decorative emoji per badge (not translated). */
export const BADGE_EMOJI: Record<Badge, string> = {
  first_dream: "🌱",
  big_dreamer: "🌠",
  doer: "✅",
  unstoppable: "🔥",
  polyglot: "🗣️",
};

export function earnedBadges(stats: BadgeInput): Badge[] {
  return BADGES.filter((badge) => RULES[badge](stats));
}
