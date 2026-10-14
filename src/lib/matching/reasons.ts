import type { BucketBudget, BucketTimeframe, Match } from "@/lib/supabase/database.types";
import { languageName } from "@/lib/onboarding";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/en";
import { formatDistance, type Region } from "@/lib/region";

type MyItem = { timeframe: BucketTimeframe; budget: BucketBudget | null };

/**
 * Human reasons for a match ("Both aiming for 2027", "Speaks Spanish",
 * "200 km away" or "124 mi away"), most meaningful first. Built from the components
 * find_matches returns, so they always agree with the score.
 */
export function matchReasons(
  match: Match,
  mine: MyItem,
  t: Messages,
  region: Pick<Region, "locale" | "units">,
  now = new Date(),
): string[] {
  const { locale } = region;
  const r = t.matches.reasons;
  const reasons: string[] = [];
  const year = now.getUTCFullYear();

  if (match.their_timeframe === mine.timeframe) {
    if (mine.timeframe === "this_year") reasons.push(format(r.sameYear, { year }));
    else if (mine.timeframe === "one_to_three_years") reasons.push(format(r.sameRange, { from: year + 1, to: year + 3 }));
    else reasons.push(r.someday);
  } else if (match.timeframe_score >= 0.5) {
    reasons.push(r.similarTiming);
  }

  if (match.shared_languages.length > 0) {
    // English is common, so a shared non-English language says more.
    const langs = [...match.shared_languages].sort((a, b) => Number(a === "en") - Number(b === "en"));
    const language = languageName(langs[0], locale);
    reasons.push(
      langs.length > 1 ? format(r.speaksMore, { language, count: langs.length - 1 }) : format(r.speaks, { language }),
    );
  }

  if (match.distance_km !== null) {
    reasons.push(
      match.distance_km <= 25
        ? format(r.underKm, { distance: formatDistance(25, region) })
        : format(r.km, { distance: formatDistance(match.distance_km, region) }),
    );
  }
  if (match.is_worldwide && (match.distance_km === null || match.distance_km > 300)) reasons.push(r.worldwide);

  if (match.shared_styles.length > 0) {
    const style = t.travelStyles[match.shared_styles[0] as keyof Messages["travelStyles"]];
    if (style) reasons.push(format(r.style, { style: style.toLowerCase() }));
  }

  if (mine.budget && match.their_budget === mine.budget) reasons.push(r.budget);
  if (match.active_within === "week") reasons.push(r.activeWeek);

  return reasons;
}
