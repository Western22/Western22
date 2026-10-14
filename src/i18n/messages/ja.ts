import type { PartialMessages } from "./types";

/**
 * Japanese (日本語). Work in progress: only the strings below are translated,
 * and everything else falls back to English (see ../get-messages.ts).
 * TODO(i18n): translate the rest (copy keys from en.ts), have a native speaker
 * review it, then add "ja" to `liveLocales` in ../config.ts.
 */
const ja: PartialMessages = {
  app: {
    tagline: "やりたいことリストをシェアして、一緒に叶える仲間を見つけよう。",
  },
  nav: {
    explore: "見つける",
    myList: "マイリスト",
    profile: "プロフィール",
    signIn: "ログイン",
    signUp: "参加する",
    signOut: "ログアウト",
    requests: "リクエスト",
    requestsPending: "新着{count}件",
    groups: "マイグループ",
    notifications: "お知らせ",
    notificationsUnread: "お知らせ（未読{count}件）",
  },
  footer: {
    guidelines: "コミュニティガイドライン",
    safety: "安全のためのヒント",
  },
  common: {
    loading: "読み込み中…",
  },
  errorPage: {
    message: "問題が発生しました。もう一度お試しください。",
    retry: "再試行",
  },
  notFound: {
    message: "ページが見つかりません。",
    home: "ホームへ戻る",
  },
  translate: {
    button: "翻訳",
    translating: "翻訳中…",
    translatedFrom: "{language}から翻訳",
    translated: "翻訳済み",
    showOriginal: "原文を表示",
    sameLanguage: "すでにあなたの言語です。",
  },
};

export default ja;
