import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
