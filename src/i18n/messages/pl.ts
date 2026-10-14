import type { PartialMessages } from "./types";

/**
 * Polish (Polski). Work in progress: only the strings below are translated,
 * and everything else falls back to English (see ../get-messages.ts).
 * TODO(i18n): translate the rest (copy keys from en.ts), have a native speaker
 * review it, then add "pl" to `liveLocales` in ../config.ts.
 */
const pl: PartialMessages = {
  app: {
    tagline: "Podziel się swoją listą marzeń. Znajdź ludzi, z którymi je spełnisz.",
  },
  nav: {
    explore: "Odkrywaj",
    myList: "Moja lista",
    profile: "Profil",
    signIn: "Zaloguj się",
    signUp: "Dołącz",
    signOut: "Wyloguj się",
    requests: "Prośby",
    requestsPending: "{count, plural, one {# nowa} few {# nowe} many {# nowych} other {# nowej}}",
    groups: "Moje grupy",
    notifications: "Powiadomienia",
    notificationsUnread: "Powiadomienia, nieprzeczytane: {count}",
  },
  footer: {
    guidelines: "Zasady społeczności",
    safety: "Wskazówki bezpieczeństwa",
  },
  common: {
    loading: "Ładowanie…",
  },
  errorPage: {
    message: "Coś poszło nie tak. Spróbuj ponownie.",
    retry: "Spróbuj ponownie",
  },
  notFound: {
    message: "Nie znaleziono strony.",
    home: "Przejdź do strony głównej",
  },
  translate: {
    button: "Przetłumacz",
    translating: "Tłumaczenie…",
    translatedFrom: "Przetłumaczono z języka: {language}",
    translated: "Przetłumaczono",
    showOriginal: "Pokaż oryginał",
    sameLanguage: "To już jest w Twoim języku.",
  },
};

export default pl;
