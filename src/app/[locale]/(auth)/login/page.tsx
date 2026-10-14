import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { getEnabledProviders } from "@/lib/auth-providers";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: (await getMessages(locale)).nav.signIn } : {};
}

/** Passwordless sign-in and sign-up: magic link, Google, Apple. */
export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-4">
      <div className="from-primary/15 via-accent to-background relative overflow-hidden rounded-2xl bg-gradient-to-br p-6">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{t.auth.title}</h1>
        <p className="text-muted-foreground mt-2">{t.auth.subtitle}</p>
        <ul aria-hidden className="mt-5 flex flex-wrap gap-2 text-sm">
          {t.auth.exampleDreams.map((dream) => (
            <li key={dream} className="bg-background/80 rounded-full border px-3 py-1 shadow-xs backdrop-blur">
              {dream}
            </li>
          ))}
        </ul>
      </div>
      {/* The form reads search params (?error=confirm, ?under18=1), so it renders at request time. */}
      <Suspense>
        <SignInForm locale={locale} providers={getEnabledProviders()} t={{ auth: t.auth, errors: t.errors }} />
      </Suspense>
    </div>
  );
}
