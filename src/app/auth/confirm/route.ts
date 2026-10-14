import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ADULT_COOKIE } from "@/lib/auth-providers";
import { defaultLocale, isLocale } from "@/i18n/config";

/**
 * Landing point for magic links and OAuth redirects.
 *  1. Exchange the PKCE `code` (or verify a `token_hash`) for a session.
 *  2. If the 18+ box was ticked before leaving, record it (confirm_adult()).
 *  3. Send new users to onboarding, everyone else to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only allow same-site relative redirects (blocks open redirects like //evil.com).
  const nextParam = searchParams.get("next") ?? "";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : `/${defaultLocale}/items`;
  const firstSegment = next.split("/")[1];
  const locale = isLocale(firstSegment) ? firstSegment : defaultLocale;

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL(`/${locale}/login?error=confirm`, origin));
  }

  const adultTicked = request.cookies.get(ADULT_COOKIE)?.value === "1";
  if (adultTicked) {
    await supabase.rpc("confirm_adult");
  }

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("onboarded_at").eq("id", userId).single()
    : { data: null };

  const destination = profile?.onboarded_at ? next : `/${locale}/welcome`;
  const response = NextResponse.redirect(new URL(destination, origin));
  if (adultTicked) response.cookies.delete(ADULT_COOKIE);
  return response;
}
