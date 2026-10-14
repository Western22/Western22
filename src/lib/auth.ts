import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/config";

/** The narrow user shape the app passes around. No email or phone. */
export type CurrentUser = { id: string };

/**
 * Data Access Layer entry point: returns the signed-in user or null.
 * Uses getClaims(), which verifies the JWT, rather than trusting the cookie.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  return { id: sub };
}

/** Like getCurrentUser, but sends signed-out visitors to the sign-in page. */
export async function requireUser(locale: Locale): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  return user;
}

/** The caller's own profile row, or null when signed out. */
export async function getMyProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw new Error("Could not load profile");
  return data;
}

/**
 * For app pages: signed in AND finished onboarding (which includes the 18+
 * confirmation). Otherwise redirect to sign-in or onboarding.
 */
export async function requireOnboardedProfile(locale: Locale): Promise<Profile> {
  const profile = await getMyProfile();
  if (!profile) redirect(`/${locale}/login`);
  if (!profile.onboarded_at || !profile.adult_confirmed_at) redirect(`/${locale}/welcome`);
  return profile;
}
