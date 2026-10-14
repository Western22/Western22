/**
 * A machine-translation service behind the Translate button. Pick one with
 * TRANSLATION_PROVIDER (deepl | google | libretranslate); see ./index.ts.
 */
export type TranslationResult = {
  text: string;
  /** Lowercase base language the service detected (e.g. "es"), when it says. */
  detectedSource: string | null;
};

export interface TranslationProvider {
  /** Short id stored with cached translations, e.g. "deepl". */
  readonly name: string;
  /** Whether this service can translate into the app language `lang` (e.g. "pt"). */
  supportsTarget(lang: string): Promise<boolean>;
  /** Translate plain text into `lang`. Throws on network or service errors. */
  translate(text: string, lang: string): Promise<TranslationResult>;
}

/** Network calls to a translation service give up after this long. */
export const TRANSLATION_TIMEOUT_MS = 8000;

/** Supported-language lists change rarely; refetch daily, retry failures after 5 minutes. */
const LIST_TTL_MS = 24 * 60 * 60 * 1000;
const LIST_RETRY_MS = 5 * 60 * 1000;

/**
 * Memoize a provider's supported-target list per server process. A failed
 * fetch is remembered as an empty list briefly, so a service outage hides the
 * button instead of slowing every page.
 */
export function cachedLanguageList(load: () => Promise<string[]>): () => Promise<Set<string>> {
  let value: Set<string> | null = null;
  let expires = 0;
  let pending: Promise<Set<string>> | null = null;
  return async () => {
    if (value && Date.now() < expires) return value;
    pending ??= load()
      .then((codes) => {
        value = new Set(codes.map((c) => c.toLowerCase()));
        expires = Date.now() + LIST_TTL_MS;
        return value;
      })
      .catch((err: unknown) => {
        console.error("[translation] could not load supported languages", err);
        value = new Set();
        expires = Date.now() + LIST_RETRY_MS;
        return value;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

/** fetch() with a timeout that throws on non-2xx answers. */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TRANSLATION_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}
