"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

/** Shown by notFound() under a locale. Strings come from next-intl (root layout). */
export default function NotFound() {
  const t = useTranslations("notFound");
  const locale = useLocale();
  return (
    <div className="flex flex-col items-start gap-2">
      <h1 className="text-xl font-semibold">{t("message")}</h1>
      <Link href={`/${locale}`} className="text-primary text-sm font-medium hover:underline">
        {t("home")}
      </Link>
    </div>
  );
}
