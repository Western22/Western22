import type { GoalCategory } from "@/lib/supabase/database.types";

/** Share-card size recommended by Facebook, LinkedIn and X. */
export const OG_SIZE = { width: 1200, height: 630 };

/** Card background per category (same palette as GoalArt, as plain colours for next/og). */
const CATEGORY_COLORS: Record<GoalCategory, [string, string]> = {
  travel: ["#7dd3fc", "#818cf8"],
  adventure: ["#fdba74", "#fb7185"],
  nature: ["#6ee7b7", "#14b8a6"],
  learning: ["#fde68a", "#fdba74"],
  creative: ["#f0abfc", "#c084fc"],
  food: ["#fef08a", "#fca5a5"],
  giving_back: ["#fecdd3", "#f472b6"],
  personal_growth: ["#d9f99d", "#34d399"],
  culture: ["#c4b5fd", "#818cf8"],
  sport: ["#a5f3fc", "#60a5fa"],
  social: ["#fbcfe8", "#fdba74"],
  other: ["#e2e8f0", "#94a3b8"],
};

/**
 * The picture shown when a goal or story is shared (Open Graph / X card).
 * Rendered by next/og, which supports a subset of CSS (flexbox only).
 */
export function ShareCard({
  category,
  kicker,
  title,
  quote,
  footer,
  appName,
}: {
  category: GoalCategory;
  kicker: string;
  title: string;
  quote?: string;
  footer: string;
  appName: string;
}) {
  const [from, to] = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        color: "#0f172a",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, fontWeight: 600, opacity: 0.75 }}>{kicker}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: title.length > 40 ? 64 : 80, fontWeight: 800, lineHeight: 1.05 }}>{title}</div>
        {quote && <div style={{ display: "flex", fontSize: 34, lineHeight: 1.3, opacity: 0.85 }}>“{quote}”</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 30 }}>
        <div style={{ display: "flex" }}>{footer}</div>
        <div style={{ display: "flex", fontWeight: 800, fontSize: 36 }}>{appName}</div>
      </div>
    </div>
  );
}
