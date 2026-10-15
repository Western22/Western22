import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Shared Sentry settings for the browser, server and edge runtimes.
 * Sentry only turns on when a DSN is set, so local development and tests
 * send nothing.
 *
 * Privacy: no IP addresses, cookies or request bodies are sent
 * (sendDefaultPii: false), and beforeSend strips anything that could identify
 * someone or let a reader sign in as them (magic-link tokens in URLs,
 * Authorization headers, email addresses in messages).
 */
export function sentryOptions(dsn: string | undefined) {
  const environment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NEXT_PUBLIC_VERCEL_ENV || "development";
  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    // A tenth of requests get performance traces in production; all in staging.
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  };
}

const SECRET_PARAMS = /([?&](?:token_hash|token|code|access_token|refresh_token|key)=)[^&#\s]+/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function scrub(text: string | undefined): string | undefined {
  return text?.replace(SECRET_PARAMS, "$1[redacted]").replace(EMAIL, "[email]");
}

/** Scrub every string inside an object (contexts, extra, tags), however deep. */
function scrubDeep<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrub(value) as T;
  if (!value || typeof value !== "object" || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as T;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v, depth + 1)])) as T;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  event.transaction = scrub(event.transaction);
  event.contexts = scrubDeep(event.contexts);
  event.extra = scrubDeep(event.extra);
  event.tags = scrubDeep(event.tags);
  if (event.request) {
    event.request.url = scrub(event.request.url);
    event.request.query_string = undefined;
    event.request.cookies = undefined;
    event.request.data = undefined;
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (/authorization|cookie|apikey/i.test(h)) delete event.request.headers[h];
      }
    }
  }
  event.message = scrub(event.message);
  for (const ex of event.exception?.values ?? []) ex.value = scrub(ex.value);
  for (const b of event.breadcrumbs ?? []) {
    b.message = scrub(b.message);
    if (b.data?.url) b.data.url = scrub(String(b.data.url));
  }
  // Keep only the user id (set by us), never emails or IPs.
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}
