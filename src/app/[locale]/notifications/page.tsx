import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/seo";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings } from "lucide-react";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NotificationList } from "@/components/notifications/notification-list";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";

const PAGE_SIZE = 30;

/** The time of this (dynamic, per-request) render, for relative times in the list. */
function requestTime(): number {
  return Date.now();
}

export async function generateMetadata({ params }: PageProps<"/[locale]/notifications">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { ...PRIVATE_PAGE, title: (await getMessages(locale)).notifications.title } : {};
}

/** Notification center: newest first, 30 at a time ("Show older" pages back). */
export default async function NotificationsPage({ params, searchParams }: PageProps<"/[locale]/notifications">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.notifications.title}</h1>
        <Link
          href={`/${locale}/settings#notifications`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <Settings className="size-4" aria-hidden />
          {t.notifications.settings.title}
        </Link>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <Notifications locale={locale} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Notifications({
  locale,
  t,
  searchParams,
}: {
  locale: Locale;
  t: Messages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireOnboardedProfile(locale);
  const { before } = await searchParams;
  const beforeIso = typeof before === "string" && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_notifications", { p_locale: locale, p_limit: PAGE_SIZE, p_before: beforeIso });
  if (error) throw new Error("Could not load notifications");
  const last = data.at(-1);

  return (
    <>
      <NotificationList rows={data} userId={profile.id} locale={locale} nt={t.notifications} renderedAt={requestTime()} />
      {data.length === PAGE_SIZE && last && (
        <Link
          href={`/${locale}/notifications?before=${encodeURIComponent(last.updated_at)}`}
          className="self-center text-sm underline"
        >
          {t.notifications.loadMore}
        </Link>
      )}
    </>
  );
}
