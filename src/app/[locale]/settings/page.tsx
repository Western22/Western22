import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { idVerificationProvider } from "@/lib/verification/id-provider";
import { VerifiedBadge } from "@/components/safety/verified-badge";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { PhoneVerification } from "./phone-verification";
import { DeleteAccountForm, PrivacyForm } from "./settings-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/settings">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getMessages(locale)).settings.title };
}

export default async function SettingsPage({ params }: PageProps<"/[locale]/settings">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);
  return (
    <div className="flex flex-col gap-8 pb-10">
      <h1 className="text-2xl font-bold tracking-tight">{t.settings.title}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <Settings locale={locale} t={t} />
      </Suspense>
    </div>
  );
}

async function Settings({ locale, t }: { locale: Locale; t: Messages }) {
  const profile = await requireOnboardedProfile(locale);
  const supabase = await createClient();
  const [{ data: settings }, { data: isModerator }] = await Promise.all([
    supabase.from("profile_settings").select("hide_from_matching, location_precision").eq("user_id", profile.id).maybeSingle(),
    supabase.rpc("is_moderator"),
  ]);
  const s = t.settings;
  const v = t.verification;
  const errorsT = { settings: s, errors: t.errors };

  return (
    <>
      <section aria-labelledby="verification-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="verification-title" className="text-lg font-semibold">
            {v.title}
          </h2>
          <VerifiedBadge profile={profile} t={v} />
        </div>
        <p className="text-muted-foreground text-sm">{v.body}</p>
        <PhoneVerification verified={Boolean(profile.phone_verified_at)} t={{ verification: v, errors: t.errors }} />
        {/* TODO(id-verification): offer "Verify my ID" once a provider is configured. */}
        {!idVerificationProvider() && <p className="text-muted-foreground text-xs">{v.idSoon}</p>}
      </section>

      <section aria-labelledby="privacy-title" className="flex flex-col gap-3">
        <h2 id="privacy-title" className="text-lg font-semibold">
          {s.privacy.title}
        </h2>
        <PrivacyForm
          hideFromMatching={settings?.hide_from_matching ?? false}
          approximate={settings?.location_precision === "approximate"}
          t={errorsT}
        />
      </section>

      <section aria-labelledby="data-title" className="flex flex-col gap-4">
        <h2 id="data-title" className="text-lg font-semibold">
          {s.data.title}
        </h2>
        <div className="flex flex-col gap-1">
          <Button asChild variant="outline" size="sm" className="self-start">
            {/* A plain link: the route handler answers with a file download. */}
            <a href="/api/export" download>
              <Download aria-hidden />
              {s.data.export}
            </a>
          </Button>
          <p className="text-muted-foreground text-sm">{s.data.exportHelp}</p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-red-200 p-4 dark:border-red-900">
          <h3 className="font-medium">{s.data.delete}</h3>
          <p className="text-muted-foreground text-sm">{s.data.deleteHelp}</p>
          <DeleteAccountForm confirmWord={profile.username ?? "DELETE"} locale={locale} t={errorsT} />
        </div>
      </section>

      <nav className="flex flex-wrap gap-4 text-sm">
        <Link href={`/${locale}/guidelines`} className="underline">
          {s.guidelines}
        </Link>
        {isModerator && (
          <Link href={`/${locale}/admin/moderation`} className="underline">
            {s.moderation}
          </Link>
        )}
      </nav>
    </>
  );
}
