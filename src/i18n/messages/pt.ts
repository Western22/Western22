import type { PartialMessages } from "./types";

/**
 * Portuguese (Português). Work in progress: only the strings below are translated,
 * and everything else falls back to English (see ../get-messages.ts).
 * TODO(i18n): translate the rest (copy keys from en.ts), have a native speaker
 * review it, then add "pt" to `liveLocales` in ../config.ts.
 */
const pt: PartialMessages = {
  app: {
    tagline: "Compartilhe sua lista de desejos. Encontre pessoas para realizá-la com você.",
  },
  nav: {
    explore: "Explorar",
    myList: "Minha lista",
    profile: "Perfil",
    signIn: "Entrar",
    signUp: "Participar",
    signOut: "Sair",
    requests: "Pedidos",
    requestsPending: "{count} novos",
    groups: "Meus grupos",
    notifications: "Notificações",
    notificationsUnread: "Notificações, {count} não lidas",
  },
  footer: {
    guidelines: "Diretrizes da comunidade",
    safety: "Dicas de segurança",
  },
  common: {
    loading: "Carregando…",
  },
  errorPage: {
    message: "Algo deu errado. Tente novamente.",
    retry: "Tentar novamente",
  },
  notFound: {
    message: "Página não encontrada.",
    home: "Ir para a página inicial",
  },
  translate: {
    button: "Traduzir",
    translating: "Traduzindo…",
    translatedFrom: "Traduzido do {language}",
    translated: "Traduzido",
    showOriginal: "Ver original",
    sameLanguage: "Isto já está no seu idioma.",
  },
};

export default pt;
