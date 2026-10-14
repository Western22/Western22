import Link from "next/link";
import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
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
        <Link href={`/${locale}`} className="mr-auto font-semibold tracking-tight">
          {t.app.name}
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${locale}/explore`}>{t.nav.explore}</Link>
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
  // TODO(notifications): email or push for new requests; for now this badge is the only signal.
  const supabase = await createClient();
  const { count } = await supabase
    .from("match_requests")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .eq("status", "pending");
  const pending = count ?? 0;
  const requestsLabel = pending > 0 ? `${t.nav.requests}, ${format(t.nav.requestsPending, { count: pending })}` : t.nav.requests;

  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/${locale}/items`}>{t.nav.myList}</Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="relative">
        <Link href={`/${locale}/requests`} aria-label={requestsLabel} title={t.nav.requests}>
          <Inbox aria-hidden />
          {pending > 0 && (
            <span
              aria-hidden
              className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
            >
              {pending > 9 ? "9+" : pending}
            </span>
          )}
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/${locale}/profile`}>{t.nav.profile}</Link>
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
