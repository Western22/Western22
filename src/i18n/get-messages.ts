import "server-only";
import type { Locale } from "./config";
import type { Messages } from "./messages/en";

/** Lazily load a locale's messages so each locale is its own chunk. */
const loaders: Record<Locale, () => Promise<Messages>> = {
  en: () => import("./messages/en").then((m) => m.default),
};

export async function getMessages(locale: Locale): Promise<Messages> {
  return loaders[locale]();
}
