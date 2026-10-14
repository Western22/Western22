import "server-only";
import { cache } from "react";
import type { Locale } from "./config";
import en, { type Messages } from "./messages/en";
import type { PartialMessages } from "./messages/types";

/** Lazily load each language so it's its own chunk. English is the base. */
const loaders: Record<Exclude<Locale, "en">, () => Promise<PartialMessages>> = {
  es: () => import("./messages/es").then((m) => m.default),
  pt: () => import("./messages/pt").then((m) => m.default),
  fr: () => import("./messages/fr").then((m) => m.default),
  de: () => import("./messages/de").then((m) => m.default),
  pl: () => import("./messages/pl").then((m) => m.default),
  hi: () => import("./messages/hi").then((m) => m.default),
  ja: () => import("./messages/ja").then((m) => m.default),
};

type Tree = { [key: string]: unknown };

/** English with a language's translations laid over it, key by key. */
function merge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = base[key];
    out[key] =
      value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object"
        ? merge(current as Tree, value as Tree)
        : value;
  }
  return out;
}

/**
 * Messages for a locale. Untranslated strings fall back to English, so a
 * language can go live gradually. Cached per request.
 */
export const getMessages = cache(async (locale: Locale): Promise<Messages> => {
  if (locale === "en") return en;
  return merge(en, (await loaders[locale]()) as Tree) as Messages;
});
