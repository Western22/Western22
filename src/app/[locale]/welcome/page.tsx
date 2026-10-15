import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/seo";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { OnboardingFlow } from "./onboarding-flow";

export async function generateMetadata({ params }: PageProps<"/[locale]/welcome">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { ...PRIVATE_PAGE, title: (await getMessages(locale)).onboarding.you.eyebrow } : {};
}

/** Onboarding. Everything here depends on the session, so it renders at request time. */
export default async function WelcomePage({ params }: PageProps<"/[locale]/welcome">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <Suspense fallback={<p className="text-muted-foreground py-10 text-center">{t.common.loading}</p>}>
      <Welcome locale={locale} t={t} />
    </Suspense>
  );
}

async function Welcome({ locale, t }: { locale: Locale; t: Messages }) {
  const profile = await getMyProfile();
  if (!profile) redirect(`/${locale}/login`);
  if (profile.onboarded_at && profile.adult_confirmed_at) {
    redirect(profile.username ? `/${locale}/u/${profile.username}` : `/${locale}/items`);
  }

  const supabase = await createClient();
  const [featured, items, hasLocation] = await Promise.all([
    supabase.rpc("search_goals", { p_query: "", p_locale: locale, p_limit: 12 }),
    supabase.from("bucket_items").select("id, goal_id, title").eq("owner_id", profile.id).order("created_at"),
    supabase.rpc("has_my_location"),
  ]);
  if (featured.error || items.error || hasLocation.error) throw new Error("Could not load onboarding");

  return (
    <OnboardingFlow
      locale={locale}
      profile={{
        id: profile.id,
        displayName: profile.display_name ?? "",
        avatarUrl: profile.avatar_url,
        homeCity: profile.home_city ?? "",
        homeCountry: profile.home_country ?? "",
        languages: profile.languages,
        interests: profile.interests,
        travelStyles: profile.travel_styles,
        adultConfirmed: profile.adult_confirmed_at !== null,
        hasLocation: hasLocation.data,
      }}
      featured={featured.data}
      initialItems={items.data.map((i) => ({ itemId: i.id, goalId: i.goal_id, title: i.title }))}
      t={{
        onboarding: t.onboarding,
        interests: t.interests,
        travelStyles: t.travelStyles,
        errors: t.errors,
        common: t.common,
      }}
    />
  );
}
