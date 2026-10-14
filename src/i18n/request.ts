import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale } from "./config";
import { getMessages } from "./get-messages";

/**
 * next-intl's per-request config. The locale comes from the [locale] segment
 * (the root layout calls setRequestLocale), and messages are English with the
 * locale's translations on top. All times are shown in UTC unless a page
 * formats them in the viewer's own time zone.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : defaultLocale;
  return { locale, messages: await getMessages(locale), timeZone: "UTC" };
});
