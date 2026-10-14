import type { PartialMessages } from "./types";

/**
 * French (Français). Work in progress: only the strings below are translated,
 * and everything else falls back to English (see ../get-messages.ts).
 * TODO(i18n): translate the rest (copy keys from en.ts), have a native speaker
 * review it, then add "fr" to `liveLocales` in ../config.ts.
 */
const fr: PartialMessages = {
  app: {
    tagline: "Partagez votre liste de rêves. Trouvez des gens pour les réaliser avec vous.",
  },
  nav: {
    explore: "Explorer",
    myList: "Ma liste",
    profile: "Profil",
    signIn: "Se connecter",
    signUp: "S’inscrire",
    signOut: "Se déconnecter",
    requests: "Demandes",
    requestsPending: "{count} nouvelles",
    groups: "Mes groupes",
    notifications: "Notifications",
    notificationsUnread: "Notifications, {count} non lues",
  },
  footer: {
    guidelines: "Règles de la communauté",
    safety: "Conseils de sécurité",
  },
  common: {
    loading: "Chargement…",
  },
  errorPage: {
    message: "Un problème est survenu. Veuillez réessayer.",
    retry: "Réessayer",
  },
  notFound: {
    message: "Page introuvable.",
    home: "Aller à l’accueil",
  },
  translate: {
    button: "Traduire",
    translating: "Traduction…",
    translatedFrom: "Traduit de : {language}",
    translated: "Traduit",
    showOriginal: "Voir l’original",
    sameLanguage: "C’est déjà dans votre langue.",
  },
};

export default fr;
