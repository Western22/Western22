import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
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

  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/${locale}/items`}>{t.nav.myList}</Link>
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
