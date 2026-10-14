"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Error boundary for pages. Strings come from next-intl (provided by the root layout). */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  return (
    <div className="flex flex-col items-start gap-3">
      <p>{t("message")}</p>
      <Button variant="outline" onClick={reset}>
        {t("retry")}
      </Button>
    </div>
  );
}
