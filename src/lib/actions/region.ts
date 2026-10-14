"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import type { FormState } from "@/lib/validation";

/** One year: how long the language cookie remembers a choice. */
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Settings > Language and region. Saves the UI language on the profile (and
 * in the cookie the proxy reads), and the currency and units for budgets and
 * distances. Empty currency/units mean "automatic" (from the home country).
 * The database re-validates everything (update_region_settings, 0011).
 */
export async function saveRegionSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const language = String(formData.get("language") ?? "");
  const currency = String(formData.get("currency") ?? "").toUpperCase();
  const units = String(formData.get("units") ?? "");
  const current = String(formData.get("currentLocale") ?? "");
  if (!isLocale(language)) return { error: "invalidInput" };
  if (currency && !/^[A-Z]{3}$/.test(currency)) return { error: "invalidInput" };
  if (units && units !== "metric" && units !== "imperial") return { error: "invalidInput" };

  const supabase = await createClient();
  const [{ error: regionError }, { error: localeError }] = await Promise.all([
    supabase.rpc("update_region_settings", { p_currency: currency || null, p_units: units || null }),
    supabase.from("profiles").update({ locale: language }).eq("id", user.id),
  ]);
  if (regionError || localeError) {
    console.error("[region] save failed", regionError?.message ?? localeError?.message);
    return { error: "generic" };
  }

  (await cookies()).set(LOCALE_COOKIE, language, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
  // A new language means new URLs; otherwise just re-render with the new currency/units.
  if (language !== current) redirect(`/${language}/settings#region`);
  refresh();
  return { ok: true };
}
