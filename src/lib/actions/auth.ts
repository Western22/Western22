"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { echoValues, signInSchema, signUpSchema, toFieldErrors, type FormState } from "@/lib/validation";

function localeFrom(formData: FormData): Locale {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : defaultLocale;
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = localeFrom(formData);
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const values = echoValues(formData, ["email"]);
  if (!parsed.success) return { error: "invalidInput", fieldErrors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.code === "invalid_credentials" ? "invalidCredentials" : "generic", values };
  }
  redirect(`/${locale}/items`);
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = localeFrom(formData);
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  const values = echoValues(formData, ["email", "displayName"]);
  if (!parsed.success) return { error: "invalidInput", fieldErrors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the handle_new_user() trigger to seed the profile.
      data: { display_name: parsed.data.displayName ?? undefined, locale },
      emailRedirectTo: `${siteUrl}/auth/confirm?next=/${locale}/profile`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") return { error: "emailTaken", values };
    if (error.code === "weak_password") return { error: "weakPassword", values };
    return { error: "generic", values };
  }

  // With email confirmation on (Supabase default) there is no session yet.
  if (!data.session) return { ok: true };
  redirect(`/${locale}/profile`);
}

export async function signOut(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}`);
}
