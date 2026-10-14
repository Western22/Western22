import type { GoalCategory } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/** Decorative emoji per category (not translated; hidden from screen readers). */
export const CATEGORY_EMOJI: Record<GoalCategory, string> = {
  travel: "✈️",
  adventure: "🪂",
  nature: "🌿",
  learning: "📚",
  creative: "🎨",
  food: "🍜",
  giving_back: "🤝",
  personal_growth: "🌱",
  culture: "🏛️",
  sport: "🏅",
  social: "🎉",
  other: "✨",
};

const CATEGORY_GRADIENT: Record<GoalCategory, string> = {
  travel: "from-sky-300 to-indigo-400",
  adventure: "from-orange-300 to-rose-400",
  nature: "from-emerald-300 to-teal-500",
  learning: "from-amber-200 to-orange-300",
  creative: "from-fuchsia-300 to-purple-400",
  food: "from-yellow-200 to-red-300",
  giving_back: "from-rose-200 to-pink-400",
  personal_growth: "from-lime-200 to-emerald-400",
  culture: "from-violet-300 to-indigo-400",
  sport: "from-cyan-200 to-blue-400",
  social: "from-pink-200 to-orange-300",
  other: "from-slate-200 to-slate-400",
};

/**
 * A goal's picture: its photo when one exists, otherwise category artwork.
 * TODO(goal-photos): seeded goals have no photos yet; see migration 0005.
 */
export function GoalArt({
  category,
  photoUrl,
  className,
  emojiClassName = "text-5xl",
}: {
  category: GoalCategory;
  photoUrl: string | null;
  className?: string;
  emojiClassName?: string;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- remote photo with a credit line; no image optimizer configured
    return <img src={photoUrl} alt="" className={cn("object-cover", className)} />;
  }
  return (
    <div aria-hidden className={cn("flex items-center justify-center bg-gradient-to-br", CATEGORY_GRADIENT[category], className)}>
      <span className={cn("drop-shadow-sm", emojiClassName)}>{CATEGORY_EMOJI[category]}</span>
    </div>
  );
}
