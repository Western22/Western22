import { redirect } from "next/navigation";
import { defaultLocale, isLocale } from "@/i18n/config";

/** Sign-up and sign-in are the same passwordless flow; keep old links working. */
export default async function SignupPage({ params }: PageProps<"/[locale]/signup">) {
  const { locale } = await params;
  redirect(`/${isLocale(locale) ? locale : defaultLocale}/login`);
}
