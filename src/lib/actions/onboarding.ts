"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/env";
import { geocodeCity } from "@/lib/geocode";
import type { GoalSuggestion } from "@/lib/supabase/database.types";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import {
  countrySchema,
  interestsSchema,
  languagesSchema,
  travelStylesSchema,
  type FormState,
} from "@/lib/validation";

/**
 * Server Actions behind the onboarding steps. Each step saves on "Continue",
 * so leaving halfway keeps progress. All writes go through RLS-protected
 * tables or SECURITY DEFINER RPCs that check auth.uid().
 */

const UNIQUE_VIOLATION = "23505";

function safeLocale(value: string): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export async function confirmAdult(): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_adult");
  return error ? { error: "generic" } : { ok: true };
}

/**
 * Under-18: sign out and leave. The empty account stays, unconfirmed, and
 * can't use the app because every page requires adult_confirmed_at.
 * TODO(age-gate): delete unconfirmed accounts (needs a service-role job).
 */
export async function declineAdult(locale: string): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${safeLocale(locale)}/login?under18=1`);
}

/** Turn a display name into a username candidate: "Ama Mensah" -> "ama_mensah". */
function usernameBase(name: string | null): string {
  const base = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  return base.length >= 3 ? base : "dreamer";
}

const basicsSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  avatarUrl: z.url().max(2048).nullable(),
});

/** Step "you": display name and photo, plus a generated username if none yet. */
export async function saveBasics(input: { displayName: string; avatarUrl: string | null }): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const parsed = basicsSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: { displayName: "invalidInput" } };

  // Only accept avatars from our own bucket, inside the caller's folder,
  // so a profile can't point at an arbitrary (tracking) URL.
  const { url } = getSupabaseEnv();
  const allowedPrefix = `${url}/storage/v1/object/public/avatars/${user.id}/`;
  if (parsed.data.avatarUrl && !parsed.data.avatarUrl.startsWith(allowedPrefix)) {
    return { error: "invalidInput" };
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();
  if (readError) return { error: "generic" };

  const update = { display_name: parsed.data.displayName, avatar_url: parsed.data.avatarUrl };
  if (current.username) {
    const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
    return error ? { error: "generic" } : { ok: true };
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return { error: "generic" };
  return (await assignUsername(user.id, parsed.data.displayName)) ? { ok: true } : { error: "generic" };
}

/** Give the profile a free username (base, then base + random digits). Returns it, or null on failure. */
async function assignUsername(userId: string, displayName: string | null): Promise<string | null> {
  const supabase = await createClient();
  const base = usernameBase(displayName);
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
    const { error } = await supabase.from("profiles").update({ username: candidate }).eq("id", userId);
    if (!error) return candidate;
    if (error.code !== UNIQUE_VIOLATION) return null;
  }
  return null;
}

const homeSchema = z.object({
  homeCity: z.string().trim().max(100),
  homeCountry: countrySchema,
  languages: languagesSchema,
});

/**
 * Step "home": city label, country and languages. If the person didn't share
 * their browser location, the typed city is geocoded into an approximate point.
 */
export async function saveHome(input: {
  homeCity: string;
  homeCountry: string;
  languages: string[];
  locale: string;
}): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };
  const parsed = homeSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      home_city: parsed.data.homeCity || null,
      home_country: parsed.data.homeCountry,
      languages: parsed.data.languages,
    })
    .eq("id", user.id);
  if (error) return { error: "generic" };

  if (parsed.data.homeCity) {
    const { data: hasLocation } = await supabase.rpc("has_my_location");
    if (!hasLocation) {
      const point = await geocodeCity(parsed.data.homeCity, parsed.data.homeCountry, safeLocale(input.locale));
      // set_my_location snaps to the ~5 km grid. A failed lookup just leaves no point.
      if (point) await supabase.rpc("set_my_location", point);
    }
  }
  return { ok: true };
}

const tastesSchema = z.object({ interests: interestsSchema, travelStyles: travelStylesSchema });

/** Step "tastes": interests and travel style. */
export async function saveTastes(input: { interests: string[]; travelStyles: string[] }): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };
  const parsed = tastesSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ interests: parsed.data.interests, travel_styles: parsed.data.travelStyles })
    .eq("id", user.id);
  return error ? { error: "generic" } : { ok: true };
}

/** Goal suggestions for the typeahead; featured goals when the query is empty. */
export async function searchGoals(query: string, locale: string): Promise<GoalSuggestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_goals", {
    p_query: query.slice(0, 140),
    p_locale: safeLocale(locale),
    p_limit: 8,
  });
  if (error) throw new Error("Could not search goals");
  return data;
}

type AddResult = { ok: true; itemId: string } | { ok: false; error: "alreadyOnList" | "invalidInput" | "generic" };

/** Add a bucket item, linked to `goalId` or matched/created from the title. */
export async function addFirstItem(title: string, goalId: string | null, locale: string): Promise<AddResult> {
  const clean = title.trim();
  if (clean.length < 3 || clean.length > 140) return { ok: false, error: "invalidInput" };
  if (goalId !== null && !z.uuid().safeParse(goalId).success) return { ok: false, error: "invalidInput" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_bucket_item", {
    p_title: clean,
    p_goal_id: goalId,
    p_visibility: "public",
    p_locale: safeLocale(locale),
  });
  if (error || !data[0]) return { ok: false, error: error?.code === UNIQUE_VIOLATION ? "alreadyOnList" : "generic" };
  return { ok: true, itemId: data[0].item_id };
}

/**
 * Last step: make sure the profile has a username (for its public URL), then
 * mark onboarding complete (the RPC requires the 18+ confirmation).
 */
export async function finishOnboarding(): Promise<{ ok: true; username: string } | { ok: false }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const supabase = await createClient();
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .single();
  if (readError) return { ok: false };

  const username = profile.username ?? (await assignUsername(user.id, profile.display_name));
  if (!username) return { ok: false };

  const { error } = await supabase.rpc("complete_onboarding");
  return error ? { ok: false } : { ok: true, username };
}
