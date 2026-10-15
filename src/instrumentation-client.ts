import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/monitoring/sentry-options";

// Browser error monitoring (Sentry). Inactive unless NEXT_PUBLIC_SENTRY_DSN is set.
// No session replay: it would record what people type and see.
Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
