import type { PartialMessages } from "./types";

/**
 * Hindi (हिन्दी). Work in progress: only the strings below are translated,
 * and everything else falls back to English (see ../get-messages.ts).
 * TODO(i18n): translate the rest (copy keys from en.ts), have a native speaker
 * review it, then add "hi" to `liveLocales` in ../config.ts.
 */
const hi: PartialMessages = {
  app: {
    tagline: "अपनी बकेट लिस्ट साझा करें। उसे साथ पूरा करने वाले लोग खोजें।",
  },
  nav: {
    explore: "खोजें",
    myList: "मेरी सूची",
    profile: "प्रोफ़ाइल",
    signIn: "साइन इन करें",
    signUp: "जुड़ें",
    signOut: "साइन आउट करें",
    requests: "अनुरोध",
    requestsPending: "{count} नए",
    groups: "मेरे समूह",
    notifications: "सूचनाएँ",
    notificationsUnread: "सूचनाएँ, {count} अपठित",
  },
  footer: {
    guidelines: "समुदाय दिशानिर्देश",
    safety: "सुरक्षा सुझाव",
  },
  common: {
    loading: "लोड हो रहा है…",
  },
  errorPage: {
    message: "कुछ गलत हो गया। कृपया फिर से कोशिश करें।",
    retry: "फिर से कोशिश करें",
  },
  notFound: {
    message: "पेज नहीं मिला।",
    home: "होम पेज पर जाएँ",
  },
  translate: {
    button: "अनुवाद करें",
    translating: "अनुवाद हो रहा है…",
    translatedFrom: "{language} से अनुवादित",
    translated: "अनुवादित",
    showOriginal: "मूल दिखाएँ",
    sameLanguage: "यह पहले से आपकी भाषा में है।",
  },
};

export default hi;
