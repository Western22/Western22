import { createTranslator } from "next-intl";

type Values = Record<string, string | number>;

/** Simple {placeholder} replacement, used if a message fails to parse. */
function replacePlaceholders(message: string, values: Values): string {
  return message.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/**
 * Format a message with ICU MessageFormat (next-intl), in `locale`:
 *
 *   format("Hi {name}", { name: "Ama" }, "en")
 *   format("{count, plural, one {# comment} other {# comments}}", { count: 2 }, "en")
 *
 * The locale picks the plural rules (Polish has one/few/many/other), and
 * numbers in plain `{count}` are printed as given. A message that fails to
 * parse, or a missing value, falls back to plain replacement and logs, so a
 * translator's typo shows up as visible text instead of a crash.
 */
export function format(message: string, values: Values, locale: string): string {
  if (!/[{}]/.test(message)) return message;
  let failed = false;
  const t = createTranslator({
    locale,
    messages: { m: message },
    onError: (error) => {
      failed = true;
      console.error(`[i18n] could not format "${message}" (${locale}): ${error.message}`);
    },
    getMessageFallback: () => replacePlaceholders(message, values),
  });
  // Plain strings keep numbers as given ("2025", not "2,025"), as before.
  const asText = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, isPluralArg(message, k) ? v : String(v)]));
  const out = t("m", asText as Values);
  return failed ? replacePlaceholders(message, values) : out;
}

/** Whether `key` is used as a plural/selectordinal/number argument (then it must stay a number). */
function isPluralArg(message: string, key: string): boolean {
  return new RegExp(`\\{\\s*${key}\\s*,\\s*(plural|selectordinal|number)`).test(message);
}
