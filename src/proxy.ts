import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, isLocale, matchLocale } from "@/i18n/config";
import { refreshSession } from "@/lib/supabase/proxy";

/**
 * Runs before every matched request:
 *  1. Paths without a locale prefix are redirected to /{locale}/...
 *     (cookie first, then Accept-Language, then the default).
 *  2. The Supabase session cookie is refreshed.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];

  // /auth/* route handlers are locale-free (Supabase redirects there).
  if (!isLocale(firstSegment) && !pathname.startsWith("/auth/")) {
    const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
    const locale = isLocale(cookieLocale)
      ? cookieLocale
      : matchLocale(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    url.search = search;
    return NextResponse.redirect(url);
  }

  return refreshSession(request);
}

export const config = {
  // Skip static assets and image optimization.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
