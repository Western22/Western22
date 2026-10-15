import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { getSupabaseEnv } from "@/lib/env";
import { liveLocales } from "@/i18n/config";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Public site origin for canonical URLs, Open Graph and the sitemap.
 * Set NEXT_PUBLIC_SITE_URL in every deployed environment (staging and
 * production); localhost is only a development fallback.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Staging and previews must never be indexed (see robots.ts). */
export function isIndexable(): boolean {
  return process.env.ALLOW_INDEXING === "true";
}

/**
 * Canonical URL plus hreflang alternates for a path under every live
 * language, e.g. path "/goals/kili" -> /en/goals/kili, /es/goals/kili.
 */
export function localizedAlternates(locale: string, path: string): Metadata["alternates"] {
  return {
    canonical: `/${locale}${path}`,
    languages: Object.fromEntries([...liveLocales.map((l) => [l, `/${l}${path}`]), ["x-default", `/en${path}`]]),
  };
}

/** Pages behind sign-in: keep them out of search results. */
export const PRIVATE_PAGE: Metadata = { robots: { index: false, follow: false } };

/**
 * A cookie-free Supabase client for public data in metadata routes (sitemap,
 * Open Graph images). It's the anonymous role, so RLS shows only public rows.
 */
export function publicSupabase() {
  const { url, key } = getSupabaseEnv();
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Shorten text for meta descriptions and share cards, on a word boundary. */
export function excerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : cut.length)}…`;
}
