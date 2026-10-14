import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { StoryList, type StoryRow } from "@/components/groups/story-list";
import type { GroupContext } from "./page";
import { StoryForm } from "./story-form";

const PHOTO_LIMIT = 30;

/** Memories tab: the group's stories and the photos shared in its chat. */
export async function MemoriesTab({ ctx, locale, t }: { ctx: GroupContext; locale: Locale; t: Messages }) {
  const supabase = await createClient();
  const [{ data: stories }, { data: photos }] = await Promise.all([
    supabase
      .from("stories")
      .select("id, body, photo_url, created_at, author:profiles(username, display_name, avatar_url)")
      .eq("group_id", ctx.id)
      .order("created_at", { ascending: false }),
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
  const storyRows: StoryRow[] = stories ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{mem.write}</h2>
        <StoryForm goalId={ctx.goalId} groupId={ctx.id} userId={ctx.me} t={{ memories: mem, errors: t.errors }} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{mem.stories}</h2>
        <StoryList stories={storyRows} locale={locale} empty={mem.storiesEmpty} />
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
                <img src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
