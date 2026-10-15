import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { AccountNotices } from "@/components/safety/account-notices";
import { isLocale, localeDirection, locales } from "@/i18n/config";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getMessages } from "@/i18n/get-messages";
import { isIndexable, siteUrl } from "@/lib/seo";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** Prerender one static shell per supported locale. */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getMessages(locale);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t.app.name, template: `%s · ${t.app.name}` },
    description: t.app.tagline,
    applicationName: t.app.name,
    openGraph: { siteName: t.app.name, locale, type: "website" },
    twitter: { card: "summary_large_image" },
    // Staging and previews are never indexed; production opts in (lib/seo.ts).
    robots: isIndexable() ? undefined : { index: false, follow: false },
  };
}

/** Root layout. The locale segment sets <html lang> and loads messages. */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getMessages(locale);
  // Client components mostly get their strings as props from server pages;
  // only the error and not-found pages read them from next-intl directly.
  const clientMessages = { errorPage: t.errorPage, notFound: t.notFound };

  return (
    <html lang={locale} dir={localeDirection(locale)} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={clientMessages} timeZone="UTC">
        {/* WCAG 2.4.1: keyboard users can jump past the header. */}
        <a
          href="#main"
          className="bg-background text-foreground sr-only z-50 rounded-md px-3 py-2 font-medium shadow focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
        >
          {t.nav.skipToContent}
        </a>
        <SiteHeader locale={locale} t={t} />
        <Suspense fallback={null}>
          <AccountNotices locale={locale} t={t} />
        </Suspense>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 outline-none">{children}</main>
        <footer className="border-t">
          <nav aria-label={t.footer.label} className="text-muted-foreground mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-1 px-4 py-4 text-sm">
            <Link href={`/${locale}/guidelines`} className="hover:underline">
              {t.footer.guidelines}
            </Link>
            <Link href={`/${locale}/guidelines#meeting-safely`} className="hover:underline">
              {t.footer.safety}
            </Link>
          </nav>
        </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
