"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { ADULT_COOKIE, getEnabledProviders, type OAuthProvider } from "@/lib/auth-providers";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { echoValues, type FormState } from "@/lib/validation";

function localeFrom(formData: FormData): Locale {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : defaultLocale;
}

/**
 * One action for the sign-in page. The submit button sets `intent`:
 *   "email"  -> send a magic link
 *   "google" | "apple" -> start the OAuth redirect
 * Every path requires the 18+ checkbox. It travels as user metadata (new
 * email signups) and as a short-lived cookie that /auth/confirm turns into a
 * confirm_adult() call (OAuth, and returning users).
 */
export async function startAuth(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = localeFrom(formData);
  const intent = String(formData.get("intent") ?? "email");
  const values = echoValues(formData, ["email"]);

  if (formData.get("adult") !== "on") {
    return { fieldErrors: { adult: "ageRequired" }, values };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const redirectTo = `${siteUrl}/auth/confirm?next=/${locale}/welcome`;

  (await cookies()).set(ADULT_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: siteUrl.startsWith("https://"),
    path: "/",
    maxAge: 30 * 60,
  });

  if (intent === "email") {
    const email = z.email().safeParse(String(formData.get("email") ?? "").trim());
    if (!email.success) return { fieldErrors: { email: "invalidEmail" }, values };

    const { error } = await supabase.auth.signInWithOtp({
      email: email.data,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
        // Read by the handle_new_user() trigger when this creates the account.
        data: { adult_confirmed: true, locale },
      },
    });
    if (error) {
      return { error: error.status === 429 ? "tooManyRequests" : "generic", values };
    }
    return { ok: true, values };
  }

  const provider = getEnabledProviders().find((p) => p === intent) as OAuthProvider | undefined;
  if (!provider) return { error: "providerUnavailable", values };

  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error || !data.url) return { error: "generic", values };
  redirect(data.url);
}

export async function signOut(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}`);
}
