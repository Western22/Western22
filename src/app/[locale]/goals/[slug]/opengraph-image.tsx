import { ImageResponse } from "next/og";
import { OG_SIZE, ShareCard } from "@/components/og/share-card";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { format } from "@/i18n/format";
import { publicSupabase } from "@/lib/seo";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Bucket-list goal";

/** Share image for a goal page: the goal, how many people want it, and the app name. */
export default async function GoalImage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params;
  const locale = isLocale(raw) ? raw : defaultLocale;
  const t = await getMessages(locale);
  const { data } = await publicSupabase().rpc("goal_details", { p_slug: slug, p_locale: locale });
  const goal = data?.[0];
  return new ImageResponse(
    (
      <ShareCard
        category={goal?.category_slug ?? "other"}
        kicker={goal?.place_name ?? t.seo.goalKicker}
        title={goal?.title ?? t.app.name}
        footer={goal ? format(t.seo.wanted, { count: goal.wanted_count }, locale) : t.app.tagline}
        appName={t.app.name}
      />
    ),
    size,
  );
}
