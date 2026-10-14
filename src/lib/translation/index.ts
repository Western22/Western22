import "server-only";
import { createDeepLProvider } from "./deepl";
import { createGoogleProvider } from "./google";
import { createLibreTranslateProvider } from "./libretranslate";
import type { TranslationProvider } from "./types";

export type { TranslationProvider, TranslationResult } from "./types";

let memo: { key: string; provider: TranslationProvider | null } | null = null;

/**
 * The configured translation service, or null when none is set up (then the
 * Translate button stays hidden).
 *
 *   TRANSLATION_PROVIDER=deepl (default)  needs DEEPL_API_KEY
 *   TRANSLATION_PROVIDER=google           needs GOOGLE_TRANSLATE_API_KEY
 *   TRANSLATION_PROVIDER=libretranslate   needs LIBRETRANSLATE_URL
 *
 * Adding another service means writing one adapter that implements
 * TranslationProvider and adding a case here.
 */
export function getTranslationProvider(): TranslationProvider | null {
  const which = (process.env.TRANSLATION_PROVIDER || "deepl").toLowerCase();
  const key = `${which}|${process.env.DEEPL_API_KEY ?? ""}|${process.env.GOOGLE_TRANSLATE_API_KEY ?? ""}|${process.env.LIBRETRANSLATE_URL ?? ""}`;
  if (memo?.key === key) return memo.provider;

  let provider: TranslationProvider | null = null;
  if (which === "deepl" && process.env.DEEPL_API_KEY) provider = createDeepLProvider(process.env.DEEPL_API_KEY);
  else if (which === "google" && process.env.GOOGLE_TRANSLATE_API_KEY) provider = createGoogleProvider(process.env.GOOGLE_TRANSLATE_API_KEY);
  else if (which === "libretranslate" && process.env.LIBRETRANSLATE_URL)
    provider = createLibreTranslateProvider(process.env.LIBRETRANSLATE_URL, process.env.LIBRETRANSLATE_API_KEY);
  else if (!["deepl", "google", "libretranslate"].includes(which)) console.error(`[translation] unknown TRANSLATION_PROVIDER "${which}"`);

  memo = { key, provider };
  return provider;
}

/** Whether to show the Translate button to someone reading the app in `lang`. */
export async function canTranslateInto(lang: string): Promise<boolean> {
  const provider = getTranslationProvider();
  return provider ? provider.supportsTarget(lang) : false;
}
