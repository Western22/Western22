import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { AccountNotices } from "@/components/safety/account-notices";
import { isLocale, locales } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
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
  return { title: { default: t.app.name, template: `%s · ${t.app.name}` }, description: t.app.tagline };
}

/** Root layout. The locale segment sets <html lang> and loads messages. */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader locale={locale} t={t} />
        <Suspense fallback={null}>
          <AccountNotices locale={locale} t={t} />
        </Suspense>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t">
          <nav className="text-muted-foreground mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-1 px-4 py-4 text-sm">
            <Link href={`/${locale}/guidelines`} className="hover:underline">
              {t.footer.guidelines}
            </Link>
            <Link href={`/${locale}/guidelines#meeting-safely`} className="hover:underline">
              {t.footer.safety}
            </Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
