import Link from "next/link";
import { MapPin, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoryCard as StoryCardData } from "@/lib/supabase/database.types";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { ReactionBar } from "./reaction-bar";
import { AddFromStoryButton } from "./add-from-story-button";
import { ReportButton } from "@/components/safety/report-button";
import { TranslatableText } from "@/components/translation/translatable-text";
import { canTranslateInto } from "@/lib/translation";

/**
 * A story: author, goal, place, photos, caption, tags, reactions, comment
 * count and "Add to my bucket list". `reason` (feed only) says why it's shown.
 * Signed-in readers get a Translate button on other people's stories.
 */
export async function StoryCard({
  story,
  locale,
  t,
  viewerId,
  reason,
  linkToStory = true,
}: {
  story: StoryCardData;
  locale: string;
  t: Messages;
  viewerId: string | null;
  reason?: string;
  linkToStory?: boolean;
}) {
  const s = t.stories;
  const name = story.author_display_name || `@${story.author_username ?? "?"}`;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(story.created_at));
  const mine = viewerId === story.author_id;
  const tagged = story.tagged.filter((p) => p.name);
  const storyHref = `/${locale}/stories/${story.id}`;
  const translatable = Boolean(viewerId) && !mine && (await canTranslateInto(locale));

  return (
    <article className="bg-card flex flex-col overflow-hidden rounded-2xl border">
      {reason && <p className="bg-muted/60 text-muted-foreground px-4 py-1.5 text-xs font-medium">{reason}</p>}
      <header className="flex items-center gap-3 px-4 pt-3">
        {story.author_avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
          <img src={story.author_avatar_url} alt="" width={40} height={40} loading="lazy" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div aria-hidden className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full font-semibold">
            {name.replace("@", "").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate">
            {story.author_username ? (
              <Link href={`/${locale}/u/${story.author_username}`} className="font-semibold hover:underline">
                {name}
              </Link>
            ) : (
              <span className="font-semibold">{name}</span>
            )}
            {tagged.length > 0 && (
              <span className="text-muted-foreground"> {format(s.with, { names: tagged.map((p) => p.name).join(", ") }, locale)}</span>
            )}
          </p>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
            <time dateTime={story.created_at}>{date}</time>
            {story.place && (
              <span className="flex items-center gap-0.5">
                · <MapPin className="size-3" aria-hidden />
                {story.place}
              </span>
            )}
            {story.group_name && <span>· {format(s.inGroup, { group: story.group_name }, locale)}</span>}
          </p>
        </div>
      </header>

      <Link
        href={`/${locale}/goals/${story.goal_slug}`}
        className="bg-primary/10 text-primary mx-4 mt-3 self-start rounded-full px-3 py-1 text-xs font-semibold hover:underline"
      >
        {story.goal_title}
      </Link>

      {story.photo_urls.length > 0 && (
        <div className={cn("mt-3 grid gap-0.5", story.photo_urls.length > 1 && "grid-cols-2")}>
          {story.photo_urls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
            <img
              key={url}
              src={url}
              alt=""
              width={800}
              height={800}
              loading="lazy"
              decoding="async"
              className={cn(
                "w-full object-cover",
                story.photo_urls.length === 1 ? "max-h-96" : "aspect-square",
                story.photo_urls.length === 3 && i === 0 && "col-span-2 aspect-[2/1]",
              )}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        {translatable ? (
          <TranslatableText
            kind="story"
            id={story.id}
            text={story.body}
            locale={locale}
            href={linkToStory ? storyHref : undefined}
            className="text-sm break-words whitespace-pre-line"
            t={{ translate: t.translate, errors: t.errors }}
          />
        ) : linkToStory ? (
          <Link href={storyHref} className="text-sm break-words whitespace-pre-line hover:underline">
            {story.body}
          </Link>
        ) : (
          <p className="text-sm break-words whitespace-pre-line">{story.body}</p>
        )}
        <ReactionBar storyId={story.id} counts={story.reactions} mine={story.my_reactions} canReact={Boolean(viewerId)} t={s} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground flex items-center gap-3 text-sm">
            <Link href={`${storyHref}#comments`} className="flex items-center gap-1 hover:underline">
              <MessageCircle className="size-4" aria-hidden />
              {format(s.commentCount, { count: story.comment_count }, locale)}
            </Link>
            {story.inspired_count > 0 && <span>{format(s.inspired, { count: story.inspired_count }, locale)}</span>}
            {viewerId && !mine && (
              <ReportButton
                targetType="story"
                targetId={story.id}
                blockUser={{ id: story.author_id, name }}
                t={{ report: t.report, errors: t.errors }}
              />
            )}
          </span>
          {mine ? null : viewerId ? (
            <AddFromStoryButton storyId={story.id} onList={story.on_my_list} t={{ stories: s, errors: t.errors }} />
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href={`/${locale}/login`}>{s.addToList}</Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
