import { cachedLanguageList, fetchJson, type TranslationProvider } from "./types";

/**
 * A self-hosted LibreTranslate server (https://libretranslate.com).
 * LIBRETRANSLATE_URL is its base URL; LIBRETRANSLATE_API_KEY is optional.
 */
export function createLibreTranslateProvider(url: string, apiKey: string | undefined): TranslationProvider {
  const base = url.replace(/\/$/, "");

  const targets = cachedLanguageList(async () => {
    const list = await fetchJson<{ code: string; targets?: string[] }[]>(`${base}/languages`);
    return [...new Set(list.flatMap((l) => [l.code, ...(l.targets ?? [])]))];
  });

  return {
    name: "libretranslate",
    async supportsTarget(lang) {
      return (await targets()).has(lang.toLowerCase());
    },
    async translate(text, lang) {
      const data = await fetchJson<{ translatedText: string; detectedLanguage?: { language?: string } }>(`${base}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, source: "auto", target: lang, format: "text", ...(apiKey ? { api_key: apiKey } : {}) }),
      });
      return { text: data.translatedText, detectedSource: data.detectedLanguage?.language?.slice(0, 2).toLowerCase() ?? null };
    },
  };
}
