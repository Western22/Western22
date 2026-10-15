"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Error boundary for pages: reports to Sentry. Strings come from next-intl (provided by the root layout). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="flex flex-col items-start gap-3">
      <p>{t("message")}</p>
      <Button variant="outline" onClick={reset}>
        {t("retry")}
      </Button>
    </div>
  );
}
