import type { ModerationCategory, ModerationProvider, ModerationVerdict } from "./types";

/**
 * Built-in provider: free, runs locally, no network. It catches common spam
 * and scam patterns and sends them to review rather than blocking, because
 * patterns misfire. Clear threats are blocked by the database's term list
 * (moderation_terms, migration 0009), which also covers anything written
 * outside the app.
 */

const LINK = /\bhttps?:\/\/|\bwww\.\S+\.\w{2,}/gi;
// Money requests and off-platform payment pushes are the most common travel-buddy scam.
const SCAM = [
  /\b(send|wire|transfer)\b.{0,30}\b(money|cash|deposit|payment|usd|eur|\$)/i,
  /\b(western union|moneygram|gift ?cards?|bitcoin|usdt|crypto)\b.{0,40}\b(pay|send|deposit|invest)/i,
  /\b(pay|send|deposit|invest)\b.{0,40}\b(western union|moneygram|gift ?cards?|bitcoin|usdt|crypto)\b/i,
  /\bguaranteed (returns|profit)\b/i,
];

export const heuristicsProvider: ModerationProvider = {
  name: "heuristics",
  async check(text) {
    const categories = new Set<ModerationCategory>();
    if ((text.match(LINK) ?? []).length >= 3) categories.add("spam");
    // Long runs of the same character or mostly capitals read as shouting/spam.
    const letters = text.replace(/[^\p{L}]/gu, "");
    if (letters.length >= 20 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) categories.add("spam");
    if (/(.)\1{14,}/u.test(text)) categories.add("spam");
    if (SCAM.some((re) => re.test(text))) categories.add("scam");
    const verdict: ModerationVerdict = { decision: categories.size > 0 ? "review" : "allow", categories: [...categories] };
    return verdict;
  },
};
