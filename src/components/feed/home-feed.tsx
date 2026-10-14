import Link from "next/link";
import { TrendingUp, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalArt } from "@/components/goal-art";
import { StoryCard } from "@/components/stories/story-card";
import { createClient } from "@/lib/supabase/server";
import { loadStoryCards } from "@/lib/stories";
import { BADGE_EMOJI, sortBadges } from "@/lib/badges";
import { FEED_CONFIG, FEED_LIMIT } from "@/lib/feed/config";
import type { FeedItem } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { BadgeCelebration } from "./badge-celebration";

/**
 * The signed-in home page: badge celebrations, then the ranked feed. Ranking
 * happens in Postgres (home_feed) with weights from src/lib/feed/config.ts,
 * and every item carries a plain-language reason.
 */
export async function HomeFeed({ userId, locale, t }: { userId: string; locale: Locale; t: Messages }) {
  const supabase = await createClient();
  const [{ data: items, error }, { data: newBadges }] = await Promise.all([
    supabase.rpc("home_feed", { p_config: FEED_CONFIG, p_limit: FEED_LIMIT }),
    supabase.rpc("new_badges"),
  ]);
  if (error) throw new Error("Could not load feed");

  const storyIds = items.filter((i) => i.kind === "story" && i.story_id).map((i) => i.story_id as string);
  const groupIds = items.filter((i) => i.kind === "new_group" && i.group_id).map((i) => i.group_id as string);
  const goalIds = items.filter((i) => i.goal_id && i.kind !== "story").map((i) => i.goal_id as string);
  const [stories, { data: groups }, { data: goals }] = await Promise.all([
    loadStoryCards(supabase, storyIds, locale),
    groupIds.length
      ? supabase.from("groups").select("id, name, description, member_count, max_size, join_policy").in("id", groupIds)
      : Promise.resolve({ data: [] }),
    goalIds.length
      ? supabase.from("goals").select("id, slug, category_slug, photo_url, place_name").in("id", goalIds)
      : Promise.resolve({ data: [] }),
  ]);
  const storyById = new Map(stories.map((s) => [s.id, s]));
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
  const goalById = new Map((goals ?? []).map((g) => [g.id, g]));
  const f = t.feed;
  const badges = sortBadges((newBadges ?? []).map((b) => b.badge));

  const reason = (item: FeedItem) =>
    item.reason === "trending"
      ? format(f.reasons.trending, { count: item.trending_count ?? 0 })
      : format(f.reasons[item.reason], { name: item.reason_label ?? "" });

  return (
    <div className="flex flex-col gap-5 pb-10">
      {badges.length > 0 && (
        <BadgeCelebration
          title={badges.length === 1 ? format(f.newBadge, { name: t.badges[badges[0]].name }) : f.newBadges}
          badges={badges.map((b) => ({ emoji: BADGE_EMOJI[b], name: t.badges[b].name, description: t.badges[b].description }))}
          cta={f.gotIt}
        />
      )}
      <h1 className="text-2xl font-bold tracking-tight">{f.title}</h1>

      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center">
          {f.empty}{" "}
          <Link href={`/${locale}/explore`} className="text-primary font-medium hover:underline">
            {t.nav.explore}
          </Link>
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {items.map((item) => {
            const key = `${item.kind}-${item.story_id ?? item.group_id ?? item.goal_id}`;
            if (item.kind === "story") {
              const story = item.story_id ? storyById.get(item.story_id) : undefined;
              return story ? (
                <li key={key}>
                  <StoryCard story={story} locale={locale} t={t} viewerId={userId} reason={reason(item)} />
                </li>
              ) : null;
            }
            const goal = item.goal_id ? goalById.get(item.goal_id) : undefined;
            if (item.kind === "new_group") {
              const group = item.group_id ? groupById.get(item.group_id) : undefined;
              if (!group || !goal) return null;
              return (
                <li key={key} className="bg-card flex flex-col overflow-hidden rounded-2xl border">
                  <p className="bg-muted/60 text-muted-foreground px-4 py-1.5 text-xs font-medium">{reason(item)}</p>
                  <div className="flex flex-col gap-2 p-4">
                    <h2 className="flex items-center gap-2 font-semibold">
                      <UsersRound className="text-primary size-4" aria-hidden />
                      {group.name}
                    </h2>
                    {group.description && <p className="text-sm">{group.description}</p>}
                    <p className="text-muted-foreground text-xs">
                      {format(t.groups.members, { count: group.member_count, max: group.max_size })} ·{" "}
                      {group.join_policy === "open" ? t.groups.policy.open : t.groups.policy.request}
                    </p>
                    <Button asChild size="sm" variant="outline" className="self-start">
                      <Link href={`/${locale}/goals/${goal.slug}#groups`}>{f.newGroupCta}</Link>
                    </Button>
                  </div>
                </li>
              );
            }
            if (!goal) return null;
            return (
              <li key={key}>
                <Link href={`/${locale}/goals/${goal.slug}`} className="bg-card flex overflow-hidden rounded-2xl border hover:shadow-md">
                  <GoalArt category={goal.category_slug} photoUrl={goal.photo_url} className="w-24 shrink-0" emojiClassName="text-3xl" />
                  <span className="flex flex-col gap-1 p-3">
                    <span className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                      <TrendingUp className="size-3.5" aria-hidden />
                      {reason(item)}
                    </span>
                    <span className="font-semibold">{item.reason_label}</span>
                    {goal.place_name && <span className="text-muted-foreground text-xs">{goal.place_name}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <details className="text-muted-foreground rounded-xl border p-4 text-sm">
        <summary className="text-foreground cursor-pointer font-medium">{f.howItWorks}</summary>
        <p className="pt-2 text-pretty">{f.howItWorksBody}</p>
      </details>
    </div>
  );
}
