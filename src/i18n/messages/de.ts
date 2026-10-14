import type { PartialMessages } from "./types";

/**
 * German (Deutsch). Work in progress: only the strings below are translated,
 * and everything else falls back to English (see ../get-messages.ts).
 * TODO(i18n): translate the rest (copy keys from en.ts), have a native speaker
 * review it, then add "de" to `liveLocales` in ../config.ts.
 */
const de: PartialMessages = {
  app: {
    tagline: "Teile deine Bucket List. Finde Leute, die mitmachen.",
  },
  nav: {
    explore: "Entdecken",
    myList: "Meine Liste",
    profile: "Profil",
    signIn: "Anmelden",
    signUp: "Mitmachen",
    signOut: "Abmelden",
    requests: "Anfragen",
    requestsPending: "{count} neu",
    groups: "Meine Gruppen",
    notifications: "Benachrichtigungen",
    notificationsUnread: "Benachrichtigungen, {count} ungelesen",
  },
  footer: {
    guidelines: "Community-Richtlinien",
    safety: "Sicherheitstipps",
  },
  common: {
    loading: "Wird geladen…",
  },
  errorPage: {
    message: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    retry: "Erneut versuchen",
  },
  notFound: {
    message: "Seite nicht gefunden.",
    home: "Zur Startseite",
  },
  translate: {
    button: "Übersetzen",
    translating: "Wird übersetzt…",
    translatedFrom: "Übersetzt aus: {language}",
    translated: "Übersetzt",
    showOriginal: "Original anzeigen",
    sameLanguage: "Das ist bereits in deiner Sprache.",
  },
};

export default de;
