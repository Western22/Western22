import { cachedLanguageList, fetchJson, type TranslationProvider } from "./types";

/**
 * DeepL API (https://developers.deepl.com). Free-plan keys end in ":fx" and
 * use api-free.deepl.com; paid keys use api.deepl.com. DEEPL_API_URL
 * overrides the host (tests point it at a local stand-in).
 *
 * DeepL wants regional variants for some targets, so app "en" -> EN-US and
 * "pt" -> PT-BR. The button only shows for targets in DeepL's own
 * /v2/languages?type=target list.
 */
const REGIONAL_TARGET: Record<string, string> = { en: "EN-US", pt: "PT-BR" };

export function deeplTarget(lang: string): string {
  return REGIONAL_TARGET[lang] ?? lang.toUpperCase();
}

export function createDeepLProvider(apiKey: string): TranslationProvider {
  const base = (process.env.DEEPL_API_URL || (apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com")).replace(/\/$/, "");
  const headers = { Authorization: `DeepL-Auth-Key ${apiKey}`, "Content-Type": "application/json" };

  const targets = cachedLanguageList(async () => {
    const list = await fetchJson<{ language: string }[]>(`${base}/v2/languages?type=target`, { headers });
    return list.map((l) => l.language);
  });

  return {
    name: "deepl",
    async supportsTarget(lang) {
      const set = await targets();
      return set.has(deeplTarget(lang).toLowerCase()) || set.has(lang.toLowerCase());
    },
    async translate(text, lang) {
      const data = await fetchJson<{ translations: { detected_source_language?: string; text: string }[] }>(`${base}/v2/translate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text: [text], target_lang: deeplTarget(lang) }),
      });
      const first = data.translations[0];
      if (!first) throw new Error("DeepL returned no translation");
      return { text: first.text, detectedSource: first.detected_source_language?.slice(0, 2).toLowerCase() ?? null };
    },
  };
}
