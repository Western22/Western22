import type { ErrorKey } from "@/i18n/messages/en";

type DbError = { code?: string; message?: string; hint?: string | null } | null | undefined;

/**
 * Trust-and-safety errors any write can hit (migration 0009): a suspended
 * account, text the database's term list blocks, or a rate limit. Returns
 * null for anything else so callers fall back to their own mapping.
 */
export function safetyError(error: DbError): ErrorKey | null {
  if (!error) return null;
  if (error.hint === "suspended") return "accountSuspended";
  if (error.code === "23514" && error.hint?.startsWith("blocked:")) return "contentBlocked";
  if (error.code === "54000") {
    if (error.message?.includes("messages")) return "tooManyMessages";
    if (error.message?.includes("follows")) return "tooManyFollows";
    if (error.message?.includes("reports")) return "tooManyReports";
    if (error.message?.includes("shares")) return "tooManyShares";
  }
  return null;
}
