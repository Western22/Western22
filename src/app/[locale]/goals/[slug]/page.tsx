import type { Metadata } from "next";
import { Suspense, cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Check, MapPin, MessageSquareText, UserRoundSearch, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalArt } from "@/components/goal-art";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMonths } from "@/lib/months";
import { isLocale, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { getMessages } from "@/i18n/get-messages";
import { format } from "@/i18n/format";
import { AddGoalButton } from "./add-goal-button";
import { JoinGroupButton } from "@/components/groups/join-group-button";
import { CreateGroupForm } from "@/components/groups/create-group-form";
import { StoryCard } from "@/components/stories/story-card";
import { loadStoryCards } from "@/lib/stories";
import { excerpt, localizedAlternates, publicSupabase } from "@/lib/seo";
import { cacheLife } from "next/cache";

const SLUG_RE = /^[a-z0-9-]{3,90}$/;

/**
 * The public view of a goal, cached for a few minutes so goal pages (the
 * pages people find through search and shares) paint fast. It's read
 * anonymously, so `my_item_id` is always null here; per-person parts stream
 * in separately. Pending goals aren't public, so their creator falls back to
 * an uncached read with their own session.
 */
async function getPublicGoal(slug: string, locale: Locale) {
  "use cache";
  cacheLife("minutes");
  const { data, error } = await publicSupabase().rpc("goal_details", { p_slug: slug, p_locale: locale });
  if (error) throw new Error("Could not load goal");
  return data[0] ?? null;
}

async function loadGoal(slug: string, locale: Locale) {
  const goal = await getPublicGoal(slug, locale);
  if (goal) return goal;
  const { data } = await (await createClient()).rpc("goal_details", { p_slug: slug, p_locale: locale });
  return data?.[0] ?? null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/goals/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !SLUG_RE.test(slug)) return {};
  const goal = await loadGoal(slug, locale);
  if (!goal) return {};
  const t = await getMessages(locale);
  const description = goal.description
    ? excerpt(goal.description)
    : format(t.seo.goalDescription, { title: goal.title, count: goal.wanted_count }, locale);
  // The share image comes from ./opengraph-image.tsx.
  return {
    title: goal.title,
    description,
    alternates: localizedAlternates(locale, `/goals/${goal.slug}`),
    openGraph: { title: goal.title, description, type: "article", url: `/${locale}/goals/${goal.slug}` },
    twitter: { title: goal.title, description },
  };
}

/** A canonical goal: what it is, who wants it, and (soon) stories and groups. */
export default function GoalPage({ params }: PageProps<"/[locale]/goals/[slug]">) {
  return (
    <Suspense fallback={<div aria-hidden className="bg-muted/60 h-64 animate-pulse rounded-3xl" />}>
      <Goal params={params} />
    </Suspense>
  );
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

async function Goal({ params }: { params: PageProps<"/[locale]/goals/[slug]">["params"] }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !SLUG_RE.test(slug)) notFound();
  const t = await getMessages(locale);

  const goal = await loadGoal(slug, locale);
  if (!goal) notFound();
  if (goal.status === "merged" && goal.merged_into_slug) redirect(`/${locale}/goals/${goal.merged_into_slug}`);

  const g = t.goal;
  const place = [goal.place_name, goal.place_country ? countryName(goal.place_country, locale) : null]
    .filter(Boolean)
    .join(", ");
  const months = goal.best_months ? formatMonths(goal.best_months, locale) : "";

  return (
    <article className="flex flex-col gap-6 pb-10">
      <div className="relative overflow-hidden rounded-3xl">
        <GoalArt category={goal.category_slug} photoUrl={goal.photo_url} className="h-48 w-full sm:h-64" emojiClassName="text-7xl" />
        {goal.photo_credit && (
          <p className="absolute end-2 bottom-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
            {format(g.photoCredit, { credit: goal.photo_credit }, locale)}
          </p>
        )}
      </div>

      {goal.status === "pending" && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {g.pending}
        </p>
      )}

      <header className="flex flex-col gap-3">
        <Link
          href={`/${locale}/explore?category=${goal.category_slug}`}
          className="bg-muted self-start rounded-full px-3 py-1 text-xs font-medium hover:underline"
        >
          {t.categories[goal.category_slug]}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-balance">{goal.title}</h1>
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {place || g.anywhere}
        </p>
        {goal.description && <p className="text-lg text-pretty">{goal.description}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-3">
        <div className="bg-card flex flex-col-reverse rounded-2xl border p-4">
          <dt className="text-muted-foreground text-sm">{g.wanted}</dt>
          <dd className="text-3xl font-bold">{goal.wanted_count}</dd>
        </div>
        <div className="bg-card flex flex-col-reverse rounded-2xl border p-4">
          <dt className="text-muted-foreground text-sm">{g.done}</dt>
          <dd className="text-3xl font-bold">{goal.done_count}</dd>
        </div>
      </dl>

      <p className="flex items-center gap-2 text-sm">
        <CalendarDays className="text-muted-foreground size-4" aria-hidden />
        <span className="font-medium">{g.bestTime}:</span> {months || g.anyTime}
      </p>

      <Suspense fallback={<div aria-hidden className="h-10" />}>
        <GoalActions goal={goal} locale={locale} t={t} />
      </Suspense>

      {/* Stories and groups stream in after the goal itself, so the title paints first (LCP). */}
      <Suspense fallback={<div aria-hidden className="bg-muted/60 h-40 animate-pulse rounded-2xl" />}>
        <GoalStories goal={goal} locale={locale} t={t} />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="bg-muted/60 h-40 animate-pulse rounded-2xl" />}>
        <GoalGroups goal={goal} locale={locale} t={t} />
      </Suspense>
    </article>
  );
}

type GoalRow = { goal_id: string; slug: string; title: string; status: string };

/** The viewer and their own item for this goal (if any). Per person: deduped per request, never cached across requests. */
const viewerAndItem = cache(async (goalId: string) => {
  const user = await getCurrentUser();
  if (!user) return { user: null, item: null };
  const { data: item } = await (await createClient())
    .from("bucket_items")
    .select("id, status")
    .eq("owner_id", user.id)
    .eq("goal_id", goalId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return { user, item };
});

/** "On your list" / "Find buddies", "Add to my list", or "Sign in to add". */
async function GoalActions({ goal, locale, t }: { goal: GoalRow; locale: Locale; t: Messages }) {
  const g = t.goal;
  const { user, item } = await viewerAndItem(goal.goal_id);
  const myItemId = item?.id ?? null;
  return (
      <div className="flex flex-wrap gap-2">
        {myItemId ? (
          <>
            <Button asChild size="lg" variant="outline">
              <Link href={`/${locale}/items`}>
                <Check aria-hidden />
                {g.onYourList}
              </Link>
            </Button>
            {goal.status === "active" && (
              <Button asChild size="lg">
                <Link href={`/${locale}/items/${myItemId}/matches`}>
                  <UserRoundSearch aria-hidden />
                  {g.findBuddies}
                </Link>
              </Button>
            )}
          </>
        ) : user ? (
          <AddGoalButton goalId={goal.goal_id} title={goal.title} locale={locale} t={{ label: g.addToList, errors: t.errors }} />
        ) : (
          <Button asChild size="lg">
            <Link href={`/${locale}/login`}>{g.signInToAdd}</Link>
          </Button>
        )}
      </div>
  );
}

async function GoalStories({ goal, locale, t }: { goal: GoalRow; locale: Locale; t: Messages }) {
  const supabase = await createClient();
  const g = t.goal;
  const [{ data: storyRows }, { user, item: myItem }] = await Promise.all([
    supabase.from("stories").select("id").eq("goal_id", goal.goal_id).order("created_at", { ascending: false }).limit(10),
    viewerAndItem(goal.goal_id),
  ]);
  const userId = user?.id ?? null;
  const stories = await loadStoryCards(supabase, (storyRows ?? []).map((r) => r.id), locale);
  return (
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareText className="size-5" aria-hidden />
          {g.stories}
        </h2>
        {myItem?.status === "done" && (
          <Button asChild size="sm" variant="outline" className="self-start">
            <Link href={`/${locale}/stories/new?goal=${goal.slug}`}>{t.stories.share}</Link>
          </Button>
        )}
        {/* Newest first. TODO(stories): consider ranking by reactions once there are many. */}
        {stories.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">{g.storiesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {stories.map((story) => (
              <li key={story.id}>
                <StoryCard story={story} locale={locale} t={t} viewerId={userId} />
              </li>
            ))}
          </ul>
        )}
      </section>

  );
}

async function GoalGroups({ goal, locale, t }: { goal: GoalRow; locale: Locale; t: Messages }) {
  const supabase = await createClient();
  const g = t.goal;
  const [{ data: groupRows }, user] = await Promise.all([supabase.rpc("goal_groups", { p_goal_id: goal.goal_id }), getCurrentUser()]);
  const signedIn = Boolean(user);
  const groups = groupRows ?? [];
  return (
      <section id="groups" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UsersRound className="size-5" aria-hidden />
          {g.groups}
        </h2>
        {groups.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">{g.groupsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((group) => {
              const full = group.member_count >= group.max_size;
              return (
                <li key={group.id} className="bg-card flex flex-col gap-2 rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">
                      {group.is_member ? (
                        <Link href={`/${locale}/groups/${group.id}`} className="hover:underline">
                          {group.name}
                        </Link>
                      ) : (
                        group.name
                      )}
                    </h3>
                    <span className="bg-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">{t.groups.status[group.status]}</span>
                  </div>
                  {group.description && <p className="text-sm text-pretty">{group.description}</p>}
                  <p className="text-muted-foreground text-xs">
                    {format(t.groups.members, { count: group.member_count, max: group.max_size }, locale)} ·{" "}
                    {group.join_policy === "open" ? t.groups.policy.open : t.groups.policy.request}
                    {group.owner_display_name && <> · {format(t.groups.by, { name: group.owner_display_name }, locale)}</>}
                  </p>
                  {group.is_member ? (
                    <Button asChild size="sm" variant="outline" className="self-start">
                      <Link href={`/${locale}/groups/${group.id}`}>{t.groups.openGroup}</Link>
                    </Button>
                  ) : group.status === "completed" ? null : !signedIn ? (
                    <Button asChild size="sm" variant="outline" className="self-start">
                      <Link href={`/${locale}/login`}>{g.signInToAdd}</Link>
                    </Button>
                  ) : full && !group.request_pending ? (
                    <span className="text-muted-foreground text-sm">{t.groups.full}</span>
                  ) : (
                    <JoinGroupButton
                      groupId={group.id}
                      policy={group.join_policy}
                      requestPending={group.request_pending}
                      locale={locale}
                      t={{ groups: t.groups, errors: t.errors }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {signedIn && goal.status === "active" && (
          <details className="group rounded-2xl border p-4">
            <summary className="cursor-pointer list-none font-medium">
              {t.groups.start}
              <span className="text-muted-foreground block text-sm font-normal">{t.groups.startHint}</span>
            </summary>
            <div className="pt-3">
              <CreateGroupForm goalId={goal.goal_id} locale={locale} t={{ groups: t.groups, errors: t.errors }} />
            </div>
          </details>
        )}
      </section>
  );
}
