import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { liveLocales } from "@/i18n/config";
import { publicSupabase, siteUrl } from "@/lib/seo";

/** Google reads up to 50,000 URLs per sitemap. */
const MAX_STORIES = 20000;

/**
 * Public, indexable pages in every live language: home, Explore, guidelines,
 * active goal pages and recent stories. Profiles are left out on purpose:
 * people can be found through their stories, but we don't list everyone.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const { goals, stories } = await loadPublicPages();


  const entry = (path: string, lastModified?: string, priority?: number): MetadataRoute.Sitemap[number] => ({
    url: `${base}/en${path}`,
    lastModified,
    priority,
    alternates: { languages: Object.fromEntries(liveLocales.map((l) => [l, `${base}/${l}${path}`])) },
  });

  return [
    entry("", undefined, 1),
    entry("/explore", undefined, 0.9),
    entry("/guidelines", undefined, 0.3),
    ...(goals ?? []).map((g) => entry(`/goals/${g.slug}`, g.updated_at, 0.8)),
    ...(stories ?? []).map((s) => entry(`/stories/${s.id}`, s.created_at, 0.6)),
  ];
}

/** Public goal slugs and story ids, cached for an hour so crawlers don't hit the database each time. */
async function loadPublicPages() {
  "use cache";
  cacheLife("hours");
  const supabase = publicSupabase();
  const [{ data: goals }, { data: stories }] = await Promise.all([
    supabase.from("goals").select("slug, updated_at").eq("status", "active").limit(40000),
    supabase.from("stories").select("id, created_at").order("created_at", { ascending: false }).limit(MAX_STORIES),
  ]);
  return { goals, stories };
}
