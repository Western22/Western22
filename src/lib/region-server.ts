import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveRegion, type Region, type Units } from "@/lib/region";

/** All stored exchange rates (units per USD), once per request. Public data. */
export const getExchangeRates = cache(async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("exchange_rates").select("currency, per_usd");
  return Object.fromEntries((data ?? []).map((r) => [r.currency, Number(r.per_usd)]));
});

/**
 * The viewer's currency and units: their own choice in Settings, otherwise
 * from their home country, otherwise USD and kilometres. Signed-out visitors
 * get the defaults. Cached per request.
 */
export const getViewerRegion = cache(async (locale: string): Promise<Region> => {
  const [user, ratesRecord] = await Promise.all([getCurrentUser(), getExchangeRates()]);
  const rates = new Map(Object.entries(ratesRecord));
  if (!user) return resolveRegion({ locale, currency: null, units: null, homeCountry: null, rates });
  const supabase = await createClient();
  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("home_country").eq("id", user.id).maybeSingle(),
    supabase.from("profile_settings").select("currency, units").eq("user_id", user.id).maybeSingle(),
  ]);
  return resolveRegion({
    locale,
    currency: settings?.currency ?? null,
    units: (settings?.units as Units | null) ?? null,
    homeCountry: profile?.home_country ?? null,
    rates,
  });
});
