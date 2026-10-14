import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily reference rates from the European Central Bank: free, public, no
 * account (https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/).
 * The ECB publishes ~30 currencies per euro once a working day around 16:00 CET;
 * we store them per US dollar. EXCHANGE_RATES_URL overrides the source (tests).
 */
const ECB_DAILY = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export type ParsedRates = { date: string; perEur: Record<string, number> };

/** Parse the ECB XML: <Cube time='2026-10-14'> ... <Cube currency='USD' rate='1.0812'/> ... */
export function parseEcbXml(xml: string): ParsedRates | null {
  const date = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!date) return null;
  const perEur: Record<string, number> = { EUR: 1 };
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g)) {
    const rate = Number(m[2]);
    if (rate > 0) perEur[m[1]] = rate;
  }
  return perEur.USD ? { date, perEur } : null;
}

/** Fetch today's rates and store them per USD. Returns how many currencies were stored. */
export async function refreshExchangeRates(): Promise<{ stored: number; date: string }> {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set");
  const res = await fetch(process.env.EXCHANGE_RATES_URL || ECB_DAILY, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`rates source answered ${res.status}`);
  const parsed = parseEcbXml(await res.text());
  if (!parsed) throw new Error("could not read the rates");
  const usdPerEur = parsed.perEur.USD;
  const rows = Object.entries(parsed.perEur).map(([currency, perEur]) => ({
    currency,
    // X per USD = (X per EUR) / (USD per EUR).
    per_usd: currency === "USD" ? 1 : perEur / usdPerEur,
    rate_date: parsed.date,
    source: "ECB",
    updated_at: new Date().toISOString(),
  }));
  const { error } = await admin.from("exchange_rates").upsert(rows, { onConflict: "currency" });
  if (error) throw new Error(`could not store rates: ${error.message}`);
  return { stored: rows.length, date: parsed.date };
}
