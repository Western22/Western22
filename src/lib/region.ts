import { format } from "@/i18n/format";
import type { BucketBudget } from "@/lib/supabase/database.types";

/**
 * Currency and units for showing money and distances to one viewer.
 * Pure and serializable, so server pages compute it once and pass it to
 * client components. Rates come from public.exchange_rates (ECB daily
 * reference rates, refreshed by /api/cron/exchange-rates).
 */
export type Region = {
  locale: string;
  currency: string;
  units: Units;
  /** Units of `currency` per 1 USD, or null when we have no rate (then we show USD). */
  perUsd: number | null;
};
export type Units = "metric" | "imperial";

/**
 * Official currency by country (ISO 3166-1 alpha-2 -> ISO 4217). Covers the
 * countries people pick most; anything missing falls back to USD.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", UY: "UYU",
  GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", PT: "EUR", IT: "EUR", NL: "EUR", BE: "EUR",
  LU: "EUR", AT: "EUR", FI: "EUR", GR: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR",
  MT: "EUR", CY: "EUR", HR: "EUR", CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", IS: "ISK", PL: "PLN",
  CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", TR: "TRY", UA: "UAH", RS: "RSD",
  IL: "ILS", AE: "AED", SA: "SAR", QA: "QAR", EG: "EGP", MA: "MAD", TN: "TND", JO: "JOD",
  ZA: "ZAR", NG: "NGN", GH: "GHS", KE: "KES", TZ: "TZS", UG: "UGX", RW: "RWF", ET: "ETB", SN: "XOF", CI: "XOF",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", CN: "CNY", HK: "HKD", TW: "TWD", JP: "JPY", KR: "KRW",
  SG: "SGD", MY: "MYR", TH: "THB", ID: "IDR", PH: "PHP", VN: "VND", AU: "AUD", NZ: "NZD",
};

/** Countries that measure road distances in miles. */
const MILES_COUNTRIES = new Set(["US", "GB", "LR", "MM"]);

/** Budget ranges are defined in US dollars (see BUCKET_BUDGETS and 0004). */
const BUDGET_USD: Record<BucketBudget, [number | null, number | null]> = {
  under_500: [null, 500],
  "500_2000": [500, 2000],
  "2000_5000": [2000, 5000],
  over_5000: [5000, null],
};

export function resolveRegion({
  locale,
  currency,
  units,
  homeCountry,
  rates,
}: {
  locale: string;
  currency: string | null;
  units: Units | null;
  homeCountry: string | null;
  rates: Map<string, number>;
}): Region {
  const wanted = currency ?? (homeCountry ? COUNTRY_CURRENCY[homeCountry] : undefined) ?? "USD";
  const perUsd = wanted === "USD" ? 1 : (rates.get(wanted) ?? null);
  return {
    locale,
    // Without a rate we can't convert, so we show the original dollars.
    currency: perUsd === null ? "USD" : wanted,
    units: units ?? (homeCountry && MILES_COUNTRIES.has(homeCountry) ? "imperial" : "metric"),
    perUsd: perUsd === null ? 1 : perUsd,
  };
}

/** Round a converted amount to 2 significant figures so it reads as an estimate (1,840 -> 1,800). */
function roughly(value: number): number {
  if (value < 10) return Math.round(value);
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
}

export function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

/**
 * A budget range in the viewer's currency, e.g. "Under $500" or "≈€460–1,800".
 * Converted amounts are rounded and marked approximate.
 */
export function formatBudget(
  budget: BucketBudget,
  region: Region,
  t: { under: string; between: string; over: string; approx: string },
): string {
  const [min, max] = BUDGET_USD[budget];
  const converted = region.currency !== "USD";
  const money = (usd: number) =>
    formatMoney(converted ? roughly(usd * (region.perUsd ?? 1)) : usd, region.currency, region.locale);
  const text =
    min === null
      ? format(t.under, { max: money(max as number) })
      : max === null
        ? format(t.over, { min: money(min) })
        : format(t.between, { min: money(min), max: money(max) });
  return converted ? format(t.approx, { amount: text }) : text;
}

/** All four budget ranges for the viewer, keyed like Messages["items"]["budget"]. */
export function budgetLabels(
  region: Region,
  t: { under: string; between: string; over: string; approx: string },
): Record<BucketBudget, string> {
  const keys = Object.keys(BUDGET_USD) as BucketBudget[];
  return Object.fromEntries(keys.map((b) => [b, formatBudget(b, region, t)])) as Record<BucketBudget, string>;
}

/**
 * An amount in another currency, converted for the viewer ("≈€920"), or null
 * when it's already their currency or we lack a rate for either side.
 */
export function convertedAmount(
  amount: number,
  fromCurrency: string,
  region: Region,
  rates: Record<string, number>,
  approx: string,
): string | null {
  if (fromCurrency === region.currency) return null;
  const fromPerUsd = fromCurrency === "USD" ? 1 : rates[fromCurrency];
  const toPerUsd = region.currency === "USD" ? 1 : rates[region.currency];
  if (!fromPerUsd || !toPerUsd) return null;
  return format(approx, { amount: formatMoney(roughly((amount / fromPerUsd) * toPerUsd), region.currency, region.locale) });
}

/** A distance in the viewer's units, e.g. "25 km" or "16 mi", localized. */
export function formatDistance(km: number, region: Pick<Region, "locale" | "units">): string {
  const imperial = region.units === "imperial";
  const value = imperial ? km * 0.621371 : km;
  return new Intl.NumberFormat(region.locale, {
    style: "unit",
    unit: imperial ? "mile" : "kilometer",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(Math.max(1, Math.round(value)));
}
