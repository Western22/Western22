/**
 * Format best months (1-12) as localized ranges, wrapping around the year:
 * [9,10,11,12,1,2,3] -> "Sep – Mar", [4,5,9,10] -> "Apr – May, Sep – Oct".
 */
export function formatMonths(months: number[], locale: string): string {
  const set = new Set(months.filter((m) => m >= 1 && m <= 12));
  if (set.size === 0 || set.size === 12) return "";
  const name = (m: number) => new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(Date.UTC(2024, m - 1, 1));

  // Start each run at a month whose previous month isn't included, so runs can wrap past December.
  const runs: [number, number][] = [];
  for (let m = 1; m <= 12; m++) {
    const prev = m === 1 ? 12 : m - 1;
    if (!set.has(m) || set.has(prev)) continue;
    let end = m;
    while (set.has((end % 12) + 1)) end = (end % 12) + 1;
    runs.push([m, end]);
  }
  return runs.map(([a, b]) => (a === b ? name(a) : `${name(a)} – ${name(b)}`)).join(", ");
}
