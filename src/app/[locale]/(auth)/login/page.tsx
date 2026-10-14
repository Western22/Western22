import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { AuthForm } from "../auth-form";

export default async function Page({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <div className="mx-auto max-w-sm">
      {/* The form reads search params, so it renders at request time. */}
      <Suspense>
        <AuthForm mode="signIn" locale={locale} t={{ auth: t.auth, errors: t.errors }} />
      </Suspense>
    </div>
  );
}
