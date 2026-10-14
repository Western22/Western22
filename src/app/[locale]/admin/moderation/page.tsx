import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Bot } from "lucide-react";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReportStatus } from "@/lib/supabase/database.types";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/en";
import { cn } from "@/lib/utils";
import { ModerationActions } from "./moderation-actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const STATUSES: ReportStatus[] = ["open", "actioned", "dismissed"];

/**
 * Moderation queue (moderators only): one card per reported target, most
 * reported first, with the content, reasons, and actions. Moderators are
 * managed in the database (public.moderators); everyone else gets a 404.
 */
export default async function ModerationPage({ params, searchParams }: PageProps<"/[locale]/admin/moderation">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);
  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="text-2xl font-bold tracking-tight">{t.admin.title}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <Queue locale={locale} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Queue({
  locale,
  t,
  searchParams,
}: {
  locale: Locale;
  t: Messages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOnboardedProfile(locale);
  const supabase = await createClient();
  const { data: isModerator } = await supabase.rpc("is_moderator");
  if (!isModerator) notFound();

  const raw = (await searchParams).status;
  const status = STATUSES.includes(raw as ReportStatus) ? (raw as ReportStatus) : "open";
  const { data: queue, error } = await supabase.rpc("moderation_queue", { p_status: status, p_limit: 100 });
  if (error) throw new Error("Could not load the moderation queue");
  const a = t.admin;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <nav aria-label={a.title} className="flex gap-1 rounded-full border p-1">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/${locale}/admin/moderation${s === "open" ? "" : `?status=${s}`}`}
            aria-current={status === s ? "page" : undefined}
            className={cn(
              "flex-1 rounded-full px-2 py-1.5 text-center text-sm font-medium",
              status === s ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {a.status[s]}
          </Link>
        ))}
      </nav>
      {queue.length === 0 ? (
        <p className="text-muted-foreground">{a.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {queue.map((item) => {
            const person = item.target_display_name || (item.target_username ? `@${item.target_username}` : null);
            return (
              <li key={`${item.target_type}-${item.target_id}`} className="bg-card flex flex-col gap-2 rounded-2xl border p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-semibold">{a.targetTypes[item.target_type]}</span>
                  <span className="font-medium">{format(a.reports, { count: item.report_count })}</span>
                  {item.auto_flagged && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                      <Bot className="size-3" aria-hidden />
                      {a.auto}
                    </span>
                  )}
                  {person && (
                    <span className="text-muted-foreground">
                      {format(a.by, { name: person })}
                      {item.target_username && (
                        <>
                          {" · "}
                          <Link href={`/${locale}/u/${item.target_username}`} className="underline">
                            {a.viewProfile}
                          </Link>
                        </>
                      )}
                      {item.target_type === "story" && item.content_exists && (
                        <>
                          {" · "}
                          <Link href={`/${locale}/stories/${item.target_id}`} className="underline">
                            {a.viewStory}
                          </Link>
                        </>
                      )}
                    </span>
                  )}
                </div>
                {item.content_exists ? (
                  <blockquote className="bg-muted/50 rounded-lg border-s-4 px-3 py-2 break-words whitespace-pre-line">{item.preview}</blockquote>
                ) : (
                  <p className="text-muted-foreground italic">{a.removed}</p>
                )}
                <p className="text-muted-foreground">
                  {item.reasons.map((r) => (r === "auto" ? a.auto : t.report.reasons[r])).join(", ")}
                  {" · "}
                  {format(a.reported, { date: when.format(new Date(item.last_reported_at)) })}
                </p>
                {item.details.length > 0 && (
                  <ul className="text-muted-foreground list-disc ps-5">
                    {item.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
                {(item.suspended_until || item.warning_count > 0) && (
                  <p className="text-muted-foreground">
                    {item.suspended_until && format(a.suspendedUntil, { date: when.format(new Date(item.suspended_until)) })}
                    {item.suspended_until && item.warning_count > 0 && " · "}
                    {item.warning_count > 0 && format(a.warnings, { count: item.warning_count })}
                  </p>
                )}
                {status === "open" && (
                  <ModerationActions
                    targetType={item.target_type}
                    targetId={item.target_id}
                    canRemove={item.target_type !== "user" && item.content_exists}
                    canSuspend={Boolean(item.target_user_id)}
                    suspended={Boolean(item.suspended_until)}
                    t={{ admin: a, errors: t.errors }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
