import type { MetadataRoute } from "next";
import { isIndexable, siteUrl } from "@/lib/seo";

/**
 * Production allows crawling of public pages (goals, stories, profiles,
 * Explore) and points at the sitemap. Anything else (staging, previews,
 * local) blocks everything, so test data never shows up in search.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/*/items", "/*/settings", "/*/requests", "/*/notifications", "/*/welcome", "/*/groups", "/*/admin", "/*/share/", "/*/unsubscribe"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
