import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/seo";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { ProfileForm } from "./profile-form";
import { LocationCard } from "./location-card";

export async function generateMetadata({ params }: PageProps<"/[locale]/profile">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { ...PRIVATE_PAGE, title: (await getMessages(locale)).profile.title } : {};
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/profile">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">{t.profile.title}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <ProfileContent locale={locale} t={t} />
      </Suspense>
    </div>
  );
}

/** Reads the session and the caller's own profile at request time. */
async function ProfileContent({ locale, t }: { locale: Locale; t: Messages }) {
  const profile = await requireOnboardedProfile(locale);
  const supabase = await createClient();
  // Returns only a boolean; coordinates never leave the database.
  const { data: hasLocation, error } = await supabase.rpc("has_my_location");
  if (error) throw new Error("Could not load location status");

  return (
    <>
      {profile.username && (
        <Link href={`/${locale}/u/${profile.username}`} className="text-primary -mt-3 text-sm font-medium underline-offset-4 hover:underline">
          {t.profile.viewPublic}
        </Link>
      )}
      <ProfileForm
        locale={locale}
        profile={profile}
        t={{ profile: t.profile, errors: t.errors, interests: t.interests, travelStyles: t.travelStyles, common: t.common }}
      />
      <LocationCard hasLocation={!!hasLocation} t={{ profile: t.profile, errors: t.errors }} />
    </>
  );
}
