import Link from "next/link";
import { Suspense } from "react";
import { Compass, Inbox, ListChecks, UserRound, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";

/**
 * Top navigation. The brand and Explore link are static; the signed-in part
 * reads the session, so it streams in behind a Suspense boundary.
 */
export function SiteHeader({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <header className="border-b">
      <nav className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-4 sm:gap-2 [&_[data-slot=button]]:px-2 sm:[&_[data-slot=button]]:px-3">
        <Link href={`/${locale}`} className="me-auto font-semibold tracking-tight">
          {t.app.name}
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${locale}/explore`} title={t.nav.explore}>
            {/* Icon-only on phones so the signed-in nav fits; the text stays for screen readers. */}
            <Compass aria-hidden className="sm:hidden" />
            <span className="max-sm:sr-only">{t.nav.explore}</span>
          </Link>
        </Button>
        <Suspense fallback={<div className="h-8 w-24" aria-hidden />}>
          <UserNav locale={locale} t={t} />
        </Suspense>
      </nav>
    </header>
  );
}

async function UserNav({ locale, t }: { locale: Locale; t: Messages }) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${locale}/login`}>{t.nav.signIn}</Link>
        </Button>
        <Button asChild size="sm">
          <Link href={`/${locale}/login`}>{t.nav.signUp}</Link>
        </Button>
      </>
    );
  }

  // Pending requests waiting for this user (RLS: only requests they are part of).
  const supabase = await createClient();
  const { data: unread } = await supabase.rpc("unread_notification_count");
  const { count } = await supabase
    .from("match_requests")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .eq("status", "pending");
  const pending = count ?? 0;
  // Group activity: unread messages, story prompts and join requests to review.
  const { data: groups } = await supabase.rpc("my_groups", { p_locale: locale });
  const groupActivity = (groups ?? []).reduce(
    (n, g) => n + g.unread_count + g.pending_requests + (g.story_prompt ? 1 : 0),
    0,
  );
  const requestsLabel = pending > 0 ? `${t.nav.requests}, ${format(t.nav.requestsPending, { count: pending })}` : t.nav.requests;

  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/${locale}/items`} title={t.nav.myList}>
          {/* Icon-only on phones so the nav (now with the bell) fits at 390 px. */}
          <ListChecks aria-hidden className="sm:hidden" />
          <span className="max-sm:sr-only">{t.nav.myList}</span>
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="relative">
        <Link
          href={`/${locale}/groups`}
          aria-label={groupActivity > 0 ? `${t.nav.groups}, ${format(t.nav.requestsPending, { count: groupActivity })}` : t.nav.groups}
          title={t.nav.groups}
        >
          <UsersRound aria-hidden />
          {groupActivity > 0 && <Badge count={groupActivity} />}
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="relative">
        <Link href={`/${locale}/requests`} aria-label={requestsLabel} title={t.nav.requests}>
          <Inbox aria-hidden />
          {pending > 0 && <Badge count={pending} />}
        </Link>
      </Button>
      <NotificationBell
        userId={user.id}
        locale={locale}
        initialCount={unread ?? 0}
        label={t.nav.notifications}
        unreadLabel={t.nav.notificationsUnread}
      />
      <Button asChild variant="ghost" size="sm">
        <Link href={`/${locale}/profile`} title={t.nav.profile}>
          <UserRound aria-hidden className="sm:hidden" />
          <span className="max-sm:sr-only">{t.nav.profile}</span>
        </Link>
      </Button>
      <form action={signOut}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="outline" size="sm">
          {t.nav.signOut}
        </Button>
      </form>
    </>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span
      aria-hidden
      className="bg-primary text-primary-foreground absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
