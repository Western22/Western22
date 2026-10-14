/**
 * Option lists for onboarding and profile editing. The database enforces the
 * same lists with CHECK constraints (migration 0003); keep them in sync.
 */

export const INTERESTS = [
  "hiking",
  "diving",
  "surfing",
  "climbing",
  "skiing",
  "running",
  "cycling",
  "wildlife",
  "photography",
  "music",
  "festivals",
  "art",
  "history",
  "food",
  "cooking",
  "wine",
  "wellness",
  "languages",
  "volunteering",
  "road_trips",
  "camping",
  "nightlife",
  "dance",
  "space",
] as const;
export type Interest = (typeof INTERESTS)[number];

export const TRAVEL_STYLES = ["solo", "budget", "luxury", "adventure"] as const;
export type TravelStyle = (typeof TRAVEL_STYLES)[number];

/**
 * Languages offered in the picker (ISO 639-1). Display names come from
 * Intl.DisplayNames in the viewer's locale, so no translations are needed here.
 */
export const LANGUAGE_CODES = [
  "en", "es", "fr", "pt", "de", "it", "nl", "sv", "no", "da", "fi", "pl", "cs", "ro", "hu", "el",
  "tr", "ru", "uk", "ar", "he", "fa", "hi", "bn", "ur", "ta", "zh", "ja", "ko", "th", "vi", "id",
  "ms", "tl", "sw", "am", "yo", "ig", "ha", "zu", "af", "tw",
] as const;

/** Max languages a profile can list (matches the DB CHECK). */
export const MAX_LANGUAGES = 12;

/** How many bucket items onboarding asks for. */
export const FIRST_ITEMS_TARGET = 3;

/** Localized display name for a language code, falling back to the code. */
export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
