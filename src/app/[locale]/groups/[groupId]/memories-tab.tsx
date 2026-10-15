import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StoryCard } from "@/components/stories/story-card";
import { loadStoryCards } from "@/lib/stories";
import type { GroupContext } from "./page";

const PHOTO_LIMIT = 30;

/** Memories tab: the group's stories and the photos shared in its chat. */
export async function MemoriesTab({ ctx, locale, t }: { ctx: GroupContext; locale: Locale; t: Messages }) {
  const supabase = await createClient();
  const [{ data: stories }, { data: photos }] = await Promise.all([
    supabase.from("stories").select("id").eq("group_id", ctx.id).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("group_messages")
      .select("image_path")
      .eq("group_id", ctx.id)
      .not("image_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(PHOTO_LIMIT),
  ]);
  // Chat photos are private; sign short-lived URLs for this view (RLS on storage checks membership).
  const paths = (photos ?? []).map((p) => p.image_path).filter((p): p is string => Boolean(p));
  const { data: signed } = paths.length
    ? await supabase.storage.from("group-media").createSignedUrls(paths, 3600)
    : { data: [] };
  const urls = (signed ?? []).map((s) => s.signedUrl).filter((u): u is string => Boolean(u));
  const mem = t.groups.memories;
  const cards = await loadStoryCards(supabase, (stories ?? []).map((r) => r.id), locale);

  return (
    <div className="flex flex-col gap-6">
      <Button asChild className="self-start">
        <Link href={`/${locale}/stories/new?goal=${ctx.goalSlug}&group=${ctx.id}`}>{mem.write}</Link>
      </Button>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{mem.stories}</h2>
        {cards.length === 0 ? (
          <p className="text-muted-foreground text-sm">{mem.storiesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {cards.map((story) => (
              <li key={story.id}>
                <StoryCard story={story} locale={locale} t={t} viewerId={ctx.me} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{mem.photos}</h2>
        {urls.length === 0 ? (
          <p className="text-muted-foreground text-sm">{mem.photosEmpty}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5">
            {urls.map((url) => (
              <li key={url}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
                <img src={url} alt="" width={400} height={400} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
