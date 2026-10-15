import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

/** Server and edge error monitoring (Sentry). Inactive unless SENTRY_DSN is set. */
export async function register() {
  Sentry.init(sentryOptions(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN));
}

/** Reports errors thrown while rendering pages, route handlers and server actions. */
export const onRequestError = Sentry.captureRequestError;
