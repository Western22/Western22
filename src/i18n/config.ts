/**
 * i18n configuration. Every page lives under /[locale]/..., so adding a
 * language means: add its code here, add a messages file, and register it in
 * `get-messages.ts`. Nothing else in the app hardcodes user-facing strings.
 */
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie the proxy reads to remember a visitor's chosen language. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/**
 * Pick the best supported locale from an Accept-Language header.
 * Matches on the primary subtag ("pt-BR" -> "pt") and falls back to the default.
 */
export function matchLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const preferred = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of preferred) {
    const exact = locales.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const primary = locales.find((l) => l.toLowerCase() === tag.split("-")[0]);
    if (primary) return primary;
  }
  return defaultLocale;
}
