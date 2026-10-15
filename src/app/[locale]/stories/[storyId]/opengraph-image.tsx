import { ImageResponse } from "next/og";
import { OG_SIZE, ShareCard } from "@/components/og/share-card";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { format } from "@/i18n/format";
import { excerpt, publicSupabase } from "@/lib/seo";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Bucket-list story";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Share image for a story without photos: the goal, a short quote and the
 * author's display name. Stories with photos use their first photo instead
 * (set in the page's generateMetadata).
 */
export default async function StoryImage({ params }: { params: Promise<{ locale: string; storyId: string }> }) {
  const { locale: raw, storyId } = await params;
  const locale = isLocale(raw) ? raw : defaultLocale;
  const t = await getMessages(locale);
  const supabase = publicSupabase();
  const { data } = UUID_RE.test(storyId) ? await supabase.rpc("story_cards", { p_ids: [storyId], p_locale: locale }) : { data: null };
  const story = data?.[0];
  let category: Parameters<typeof ShareCard>[0]["category"] = "other";
  if (story) {
    const { data: goal } = await supabase.from("goals").select("category_slug").eq("id", story.goal_id).maybeSingle();
    category = goal?.category_slug ?? "other";
  }
  const name = story?.author_display_name || (story?.author_username ? `@${story.author_username}` : "");
  return new ImageResponse(
    (
      <ShareCard
        category={category}
        kicker={t.seo.storyKicker}
        title={story?.goal_title ?? t.app.name}
        quote={story ? excerpt(story.body, 110) : undefined}
        footer={story && name ? format(t.seo.storyBy, { name }, locale) : t.app.tagline}
        appName={t.app.name}
      />
    ),
    size,
  );
}
