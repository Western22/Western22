"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { syncTimezone } from "@/lib/actions/notifications";
import { format } from "@/i18n/format";

const TZ_SYNCED_KEY = "tz-synced";

/**
 * Header bell with a live unread count. Realtime delivers changes to the
 * person's own notifications (RLS applies to Realtime too); on each change we
 * re-ask the database for the count rather than trusting event order.
 * It also reports the browser's time zone once per session, so quiet hours
 * and the weekly digest follow local time.
 */
export function NotificationBell({
  userId,
  locale,
  initialCount,
  label,
  unreadLabel,
}: {
  userId: string;
  locale: string;
  initialCount: number;
  label: string;
  unreadLabel: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(initialCount);
  // A fresh server render (navigation, router.refresh) brings a new initial count.
  const [seenInitial, setSeenInitial] = useState(initialCount);
  if (seenInitial !== initialCount) {
    setSeenInitial(initialCount);
    setCount(initialCount);
  }

  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        supabase.rpc("unread_notification_count").then(({ data }) => {
          if (typeof data === "number") setCount(data);
        });
      })
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [supabase, userId]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(TZ_SYNCED_KEY)) return;
      sessionStorage.setItem(TZ_SYNCED_KEY, "1");
    } catch {
      // Storage blocked: syncing once per page load is fine too.
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) void syncTimezone(tz);
  }, []);

  return (
    <Button asChild variant="ghost" size="sm" className="relative">
      <Link
        href={`/${locale}/notifications`}
        aria-label={count > 0 ? format(unreadLabel, { count }) : label}
        title={label}
        data-testid="notification-bell"
      >
        <Bell aria-hidden />
        {count > 0 && (
          <span
            aria-hidden
            className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
