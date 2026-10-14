import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HomeFeed } from "@/components/feed/home-feed";
import { getCurrentUser } from "@/lib/auth";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";

/**
 * Home: the feed for signed-in people, the landing page for everyone else.
 * The landing page is the static fallback while the session is checked.
 */
export default async function HomePage({ params, searchParams }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);
  return (
    <>
      <Suspense fallback={null}>
        <DeletedNotice searchParams={searchParams} text={t.settings.data.deleted} />
      </Suspense>
      <Suspense fallback={<Landing locale={locale} t={t} />}>
        <Home locale={locale} t={t} />
      </Suspense>
    </>
  );
}

/** Confirmation after account deletion redirects here with ?deleted=1. */
async function DeletedNotice({ searchParams, text }: { searchParams: Promise<Record<string, string | string[] | undefined>>; text: string }) {
  const { deleted } = await searchParams;
  if (deleted !== "1") return null;
  return (
    <p role="status" className="bg-muted mb-4 rounded-xl p-3 text-sm">
      {text}
    </p>
  );
}

async function Home({ locale, t }: { locale: Locale; t: Messages }) {
  const user = await getCurrentUser();
  // TODO(feed): send signed-in people who haven't finished onboarding to /welcome.
  return user ? <HomeFeed userId={user.id} locale={locale} t={t} /> : <Landing locale={locale} t={t} />;
}

function Landing({ locale, t }: { locale: Locale; t: Messages }) {
  const steps = [t.home.steps.add, t.home.steps.match, t.home.steps.plan, t.home.steps.share];

  return (
    <div className="flex flex-col gap-10 py-6">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t.home.heroTitle}</h1>
        <p className="text-muted-foreground text-lg text-pretty">{t.home.heroBody}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={`/${locale}/login`}>{t.home.ctaStart}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/${locale}/explore`}>{t.home.ctaExplore}</Link>
          </Button>
        </div>
      </section>
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((step, i) => (
          <li key={step} className="bg-accent flex items-center gap-3 rounded-lg p-4">
            <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              {i + 1}
            </span>
            <span className="font-medium">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
