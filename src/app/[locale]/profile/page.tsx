import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { ProfileForm } from "./profile-form";
import { LocationCard } from "./location-card";

export async function generateMetadata({ params }: PageProps<"/[locale]/profile">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: (await getMessages(locale)).profile.title } : {};
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
  const user = await requireUser(locale);
  const supabase = await createClient();

  const [{ data: profile, error }, { data: hasLocation }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, bio, home_city, home_country")
      .eq("id", user.id)
      .single(),
    // Returns only a boolean; coordinates never leave the database.
    supabase.rpc("has_my_location"),
  ]);
  if (error) throw new Error("Could not load profile");

  return (
    <>
      <ProfileForm profile={profile} t={{ profile: t.profile, errors: t.errors }} />
      <LocationCard hasLocation={!!hasLocation} t={{ profile: t.profile, errors: t.errors }} />
    </>
  );
}
