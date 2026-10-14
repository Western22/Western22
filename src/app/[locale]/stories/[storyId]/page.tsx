import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadStoryCards } from "@/lib/stories";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { StoryCard } from "@/components/stories/story-card";
import { CommentForm, DeleteCommentButton, UntagButton } from "./comment-controls";
import { ReportButton } from "@/components/safety/report-button";
import { TranslatableText } from "@/components/translation/translatable-text";
import { canTranslateInto } from "@/lib/translation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/[locale]/stories/[storyId]">): Promise<Metadata> {
  const { locale, storyId } = await params;
  if (!isLocale(locale) || !UUID_RE.test(storyId)) return {};
  const supabase = await createClient();
  const [story] = await loadStoryCards(supabase, [storyId], locale);
  return story ? { title: story.goal_title, description: story.body.slice(0, 160) } : {};
}

/** One story with its comments. Public, so it can be shared. */
export default function StoryPage({ params }: PageProps<"/[locale]/stories/[storyId]">) {
  return (
    <Suspense fallback={<div aria-hidden className="bg-muted/60 h-64 animate-pulse rounded-3xl" />}>
      <Story params={params} />
    </Suspense>
  );
}

async function Story({ params }: { params: PageProps<"/[locale]/stories/[storyId]">["params"] }) {
  const { locale, storyId } = await params;
  if (!isLocale(locale) || !UUID_RE.test(storyId)) notFound();
  const t = await getMessages(locale);
  const supabase = await createClient();
  const [[story], user] = await Promise.all([loadStoryCards(supabase, [storyId], locale), getCurrentUser()]);
  if (!story) notFound();

  const [{ data: comments }, { data: myTag }] = await Promise.all([
    supabase
      .from("story_comments")
      .select("id, body, created_at, author_id, author:profiles(username, display_name)")
      .eq("story_id", story.id)
      .order("created_at")
      .limit(200),
    user
      ? supabase.from("story_tags").select("user_id").eq("story_id", story.id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const s = t.stories;
  const timeFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const translatable = Boolean(user) && (await canTranslateInto(locale));

  return (
    <div className="flex flex-col gap-5 pb-10">
      <StoryCard story={story} locale={locale} t={t} viewerId={user?.id ?? null} linkToStory={false} />
      {myTag && <UntagButton storyId={story.id} label={s.untag} />}

      <section id="comments" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="text-lg font-semibold">{s.comments}</h2>
        {(comments ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{s.noComments}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(comments ?? []).map((c) => {
              const name = c.author?.display_name || `@${c.author?.username ?? "?"}`;
              const canDelete = user && (c.author_id === user.id || story.author_id === user.id);
              return (
                <li key={c.id} className="flex items-start gap-2 rounded-xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      {c.author?.username ? (
                        <Link href={`/${locale}/u/${c.author.username}`} className="font-semibold hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <span className="font-semibold">{name}</span>
                      )}{" "}
                      <time dateTime={c.created_at} className="text-muted-foreground">
                        {timeFormat.format(new Date(c.created_at))}
                      </time>
                    </p>
                    {translatable && c.author_id !== user?.id ? (
                      <TranslatableText
                        kind="comment"
                        id={c.id}
                        text={c.body}
                        locale={locale}
                        className="text-sm break-words whitespace-pre-line"
                        t={{ translate: t.translate, errors: t.errors }}
                      />
                    ) : (
                      <p className="text-sm break-words whitespace-pre-line">{c.body}</p>
                    )}
                    {user && c.author_id !== user.id && (
                      <ReportButton
                        targetType="comment"
                        targetId={c.id}
                        blockUser={{ id: c.author_id, name }}
                        t={{ report: t.report, errors: t.errors }}
                      />
                    )}
                  </div>
                  {canDelete && <DeleteCommentButton commentId={c.id} label={s.deleteComment} />}
                </li>
              );
            })}
          </ul>
        )}
        {user ? (
          <CommentForm storyId={story.id} t={{ stories: s, errors: t.errors }} />
        ) : (
          <p className="text-muted-foreground text-sm">
            <Link href={`/${locale}/login`} className="text-primary font-medium hover:underline">
              {t.nav.signIn}
            </Link>{" "}
            · {s.signInToReact}
          </p>
        )}
      </section>
    </div>
  );
}
