import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/seo";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { idVerificationProvider } from "@/lib/verification/id-provider";
import { VerifiedBadge } from "@/components/safety/verified-badge";
import { isLocale, liveLocales, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { PhoneVerification } from "./phone-verification";
import { DeleteAccountForm, PrivacyForm } from "./settings-forms";
import { NotificationSettingsForm } from "./notification-settings";
import { RegionSettingsForm } from "./region-settings";
import { getExchangeRates } from "@/lib/region-server";
import { resolveRegion } from "@/lib/region";
import { PushToggle } from "@/components/notifications/push-toggle";

export async function generateMetadata({ params }: PageProps<"/[locale]/settings">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { ...PRIVATE_PAGE, title: (await getMessages(locale)).settings.title };
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
  const [{ data: settings }, { data: isModerator }, { data: prefs }, { data: notify }, rates] = await Promise.all([
    supabase
      .from("profile_settings")
      .select("hide_from_matching, location_precision, currency, units")
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase.rpc("is_moderator"),
    supabase.rpc("my_notification_preferences"),
    supabase.from("notification_settings").select("timezone, quiet_start, quiet_end, email_paused").eq("user_id", profile.id).maybeSingle(),
    getExchangeRates(),
  ]);
  // What "Automatic" means for this person: from their home country.
  const auto = resolveRegion({ locale, currency: null, units: null, homeCountry: profile.home_country, rates: new Map(Object.entries(rates)) });
  const ns = t.notifications.settings;
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

      <section id="region" aria-labelledby="region-title" className="flex scroll-mt-4 flex-col gap-3">
        <h2 id="region-title" className="text-lg font-semibold">
          {s.region.title}
        </h2>
        <RegionSettingsForm
          locale={locale}
          languages={liveLocales}
          currencies={["USD", ...Object.keys(rates)].filter((c, i, all) => all.indexOf(c) === i)}
          currency={settings?.currency ?? null}
          units={(settings?.units as "metric" | "imperial" | null) ?? null}
          auto={{ currency: auto.currency, units: auto.units }}
          t={{ region: s.region, errors: t.errors }}
        />
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

      <section id="notifications" aria-labelledby="notifications-title" className="flex scroll-mt-4 flex-col gap-3">
        <h2 id="notifications-title" className="text-lg font-semibold">
          {ns.title}
        </h2>
        <p className="text-muted-foreground text-sm">{ns.help}</p>
        <div className="flex flex-col gap-1 rounded-xl border p-3">
          <h3 className="text-sm font-medium">{ns.push.title}</h3>
          <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} t={ns.push} />
        </div>
        <NotificationSettingsForm
          prefs={prefs ?? []}
          timezone={notify?.timezone ?? null}
          quietStart={notify?.quiet_start ?? null}
          quietEnd={notify?.quiet_end ?? null}
          emailPaused={notify?.email_paused ?? false}
          t={{ ns, errors: t.errors }}
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
