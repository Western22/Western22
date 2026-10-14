"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acknowledgeSafetyTips } from "@/lib/actions/safety";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";

/**
 * Meetup safety tips, shown before someone's first meetup (a confirmed or
 * planning group, or an accepted request) until they tap "Got it".
 */
export function SafetyTips({ locale, t }: { locale: Locale; t: Messages["safety"] }) {
  const [pending, startTransition] = useTransition();
  return (
    <section aria-labelledby="safety-tips-title" className="flex flex-col gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50">
      <h2 id="safety-tips-title" className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-4" aria-hidden />
        {t.tipsTitle}
      </h2>
      <ul className="flex list-disc flex-col gap-1 ps-5">
        {t.tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" disabled={pending} onClick={() => startTransition(() => acknowledgeSafetyTips())}>
          {t.acknowledge}
        </Button>
        <Link href={`/${locale}/guidelines#meeting-safely`} className="underline">
          {t.more}
        </Link>
      </div>
    </section>
  );
}
