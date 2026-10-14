/**
 * i18n configuration (used by next-intl via ./request.ts). Every page lives
 * under /[locale]/...
 *
 * `locales` are all languages with a messages file; each file only needs the
 * strings translated so far, and anything missing falls back to English.
 * `liveLocales` are the ones offered to people (language picker and
 * browser-language detection). Move a language into it once its file is
 * complete and reviewed. Other locales still work by URL, for translators.
 */
export const locales = ["en", "es", "pt", "fr", "de", "pl", "hi", "ja"] as const;
export type Locale = (typeof locales)[number];

// TODO(i18n): add each language here once its messages file is fully translated.
export const liveLocales: readonly Locale[] = ["en"];

export const defaultLocale: Locale = "en";

/**
 * Right-to-left scripts. None is live yet, but layouts use logical Tailwind
 * classes (ms-/me-/ps-/pe-/start-/end-/text-start), so adding Arabic or
 * Hebrew is a messages file plus adding the code to `locales`.
 */
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

export function localeDirection(locale: string): "ltr" | "rtl" {
  return RTL_LANGUAGES.has(locale.split("-")[0]) ? "rtl" : "ltr";
}

/** Cookie the proxy reads to remember a visitor's chosen language. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/**
 * Pick the best live locale from an Accept-Language header.
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
    const exact = liveLocales.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const primary = liveLocales.find((l) => l.toLowerCase() === tag.split("-")[0]);
    if (primary) return primary;
  }
  return defaultLocale;
}
