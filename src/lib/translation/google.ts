import { cachedLanguageList, fetchJson, type TranslationProvider } from "./types";

/**
 * Google Cloud Translation, Basic (v2) REST API with an API key.
 * GOOGLE_TRANSLATE_URL overrides the endpoint base (for tests).
 */
export function createGoogleProvider(apiKey: string): TranslationProvider {
  const base = (process.env.GOOGLE_TRANSLATE_URL || "https://translation.googleapis.com/language/translate/v2").replace(/\/$/, "");
  const key = encodeURIComponent(apiKey);

  const targets = cachedLanguageList(async () => {
    const data = await fetchJson<{ data: { languages: { language: string }[] } }>(`${base}/languages?key=${key}`);
    return data.data.languages.map((l) => l.language);
  });

  return {
    name: "google",
    async supportsTarget(lang) {
      return (await targets()).has(lang.toLowerCase());
    },
    async translate(text, lang) {
      const data = await fetchJson<{ data: { translations: { translatedText: string; detectedSourceLanguage?: string }[] } }>(
        `${base}?key=${key}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: text, target: lang, format: "text" }) },
      );
      const first = data.data.translations[0];
      if (!first) throw new Error("Google returned no translation");
      return { text: first.translatedText, detectedSource: first.detectedSourceLanguage?.slice(0, 2).toLowerCase() ?? null };
    },
  };
}
