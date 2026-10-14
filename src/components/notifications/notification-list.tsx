"use client";

import { useEffect, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Heart, MessageCircle, Sparkles, UserPlus, UserRoundCheck, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { renderNotification } from "@/lib/notifications/render";
import type { NotificationListRow } from "@/lib/supabase/database.types";
import type { Messages } from "@/i18n/messages/en";
import { cn } from "@/lib/utils";

const ICONS = {
  new_match: Sparkles,
  buddy_request: UserPlus,
  request_accepted: UserRoundCheck,
  group_message: MessageCircle,
  plan_vote: Vote,
  date_approaching: CalendarClock,
  story_reaction: Heart,
} as const;

/**
 * The notification center list. Opening one marks it read; new ones appear
 * live (Realtime refreshes the server-rendered list).
 */
export function NotificationList({
  rows,
  userId,
  locale,
  nt,
  renderedAt,
}: {
  rows: NotificationListRow[];
  /** When the server rendered the list (ms), for "5 min ago" without reading the clock during render. */
  renderedAt: number;
  userId: string;
  locale: string;
  nt: Messages["notifications"];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pending, startTransition] = useTransition();
  const relative = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" }), [locale]);

  useEffect(() => {
    const channel = supabase
      .channel(`notification-list:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [supabase, userId, router]);

  const unread = rows.filter((r) => !r.read_at);

  if (rows.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-pretty">{nt.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {unread.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-end"
          disabled={pending}
          onClick={() => startTransition(() => markNotificationsRead(null))}
        >
          {nt.markAllRead}
        </Button>
      )}
      <ul className="flex flex-col divide-y rounded-2xl border">
        {rows.map((row) => {
          const r = renderNotification(row, nt, locale);
          const Icon = ICONS[row.type];
          const minutes = Math.round((new Date(row.updated_at).getTime() - renderedAt) / 60000);
          const when =
            Math.abs(minutes) < 60
              ? relative.format(minutes, "minute")
              : Math.abs(minutes) < 60 * 24
                ? relative.format(Math.round(minutes / 60), "hour")
                : relative.format(Math.round(minutes / 1440), "day");
          return (
            <li key={row.id}>
              <Link
                href={r.path}
                onClick={() => {
                  if (!row.read_at) void markNotificationsRead([row.id]);
                }}
                className={cn("hover:bg-accent flex items-start gap-3 p-3 text-sm", !row.read_at && "bg-accent/40")}
              >
                <span className="bg-muted mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("text-pretty break-words", !row.read_at && "font-medium")}>{r.text}</span>
                  <span className="text-muted-foreground text-xs">
                    <time dateTime={row.updated_at}>{when}</time>
                    {!row.read_at && <span className="sr-only"> · {nt.unread}</span>}
                  </span>
                </span>
                {!row.read_at && <span aria-hidden className="bg-primary mt-2 size-2 shrink-0 rounded-full" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
