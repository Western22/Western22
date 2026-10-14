import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/supabase/database.types";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { format } from "@/i18n/format";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Where "Turn off these emails" / "Pause all email" links land. No sign-in:
 * the token in the link identifies the person. A button press (POST) does the
 * unsubscribing, so email link scanners that only GET can't.
 */
export default async function UnsubscribePage({ params, searchParams }: PageProps<"/[locale]/unsubscribe">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);
  return (
    <div className="flex flex-col gap-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">{t.notifications.unsubscribe.title}</h1>
      <Suspense fallback={null}>
        <Unsubscribe locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Unsubscribe({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getMessages(locale);
  const u = t.notifications.unsubscribe;
  const { token, type } = await searchParams;
  const kind = typeof type === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(type) ? (type as NotificationType) : "all";
  if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) {
    return <p className="text-muted-foreground">{u.invalid}</p>;
  }
  const question =
    kind === "all" ? format(u.confirmAll, { app: t.app.name }) : format(u.confirm, { what: t.notifications.settings.types[kind] });
  return (
    <UnsubscribeForm
      token={token}
      type={kind}
      question={question}
      t={{ button: u.button, done: kind === "all" ? u.doneAll : u.done, manage: u.manage, errors: t.errors }}
      settingsHref={`/${locale}/settings#notifications`}
    />
  );
}
