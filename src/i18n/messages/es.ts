import type { PartialMessages } from "./types";

/**
 * Spanish (Español). Work in progress: only the strings below are translated,
 * and everything else falls back to English (see ../get-messages.ts).
 * TODO(i18n): translate the rest (copy keys from en.ts), have a native speaker
 * review it, then add "es" to `liveLocales` in ../config.ts.
 */
const es: PartialMessages = {
  app: {
    tagline: "Comparte tu lista de deseos. Encuentra gente para cumplirla.",
  },
  nav: {
    explore: "Explorar",
    myList: "Mi lista",
    profile: "Perfil",
    signIn: "Iniciar sesión",
    signUp: "Unirse",
    signOut: "Cerrar sesión",
    requests: "Solicitudes",
    requestsPending: "{count} nuevas",
    groups: "Mis grupos",
    notifications: "Notificaciones",
    notificationsUnread: "Notificaciones, {count} sin leer",
  },
  footer: {
    guidelines: "Normas de la comunidad",
    safety: "Consejos de seguridad",
  },
  common: {
    loading: "Cargando…",
  },
  errorPage: {
    message: "Algo salió mal. Inténtalo de nuevo.",
    retry: "Reintentar",
  },
  notFound: {
    message: "Página no encontrada.",
    home: "Ir a la página de inicio",
  },
  translate: {
    button: "Traducir",
    translating: "Traduciendo…",
    translatedFrom: "Traducido del {language}",
    translated: "Traducido",
    showOriginal: "Ver original",
    sameLanguage: "Ya está en tu idioma.",
  },
};

export default es;
