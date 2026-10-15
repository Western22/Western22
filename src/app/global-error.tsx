"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort error page for when the root layout itself fails, so the
 * language and messages couldn't load. Kept in plain English on purpose;
 * page-level errors use the translated [locale]/error.tsx.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <p>Something went wrong. Please try again.</p>
        <button type="button" onClick={reset} style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 8 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
