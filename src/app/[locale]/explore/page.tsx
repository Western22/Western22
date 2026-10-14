import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { GoalArt } from "@/components/goal-art";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  EXPLORE_SORTS,
  GOAL_CATEGORIES,
  GOAL_REGIONS,
  SEASONS,
  type ExploreGoal,
  type ExploreSort,
  type GoalCategory,
  type GoalRegion,
  type Season,
} from "@/lib/supabase/database.types";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;

type Filters = {
  category: GoalCategory | null;
  region: GoalRegion | null;
  season: Season | null;
  sort: ExploreSort;
  page: number;
};

export async function generateMetadata({ params }: PageProps<"/[locale]/explore">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: (await getMessages(locale)).explore.title } : {};
}

/** Browse canonical goals by category, region, season, trending and near me. */
export default async function ExplorePage({ params, searchParams }: PageProps<"/[locale]/explore">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.explore.title}</h1>
        <p className="text-muted-foreground">{t.explore.subtitle}</p>
      </div>
      {/* Filters come from the URL, so everything below renders at request time. */}
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <Explore locale={locale} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Read a search param only if it's one of the allowed values. */
function pick<T extends string>(options: readonly T[], value: string | string[] | undefined): T | null {
  return typeof value === "string" ? (options.find((o) => o === value) ?? null) : null;
}

function exploreHref(locale: string, filters: Filters, change: Partial<Filters>): string {
  const next = { ...filters, page: 1, ...change };
  const query = new URLSearchParams();
  if (next.sort !== "popular") query.set("sort", next.sort);
  if (next.category) query.set("category", next.category);
  if (next.region) query.set("region", next.region);
  if (next.season) query.set("season", next.season);
  if (next.page > 1) query.set("page", String(next.page));
  const qs = query.toString();
  return `/${locale}/explore${qs ? `?${qs}` : ""}`;
}

async function Explore({
  locale,
  t,
  searchParams,
}: {
  locale: Locale;
  t: Messages;
  searchParams: PageProps<"/[locale]/explore">["searchParams"];
}) {
  const sp = await searchParams;
  const page = Math.min(Math.max(Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1, 1), 50);
  const filters: Filters = {
    category: pick(GOAL_CATEGORIES, sp.category),
    region: pick(GOAL_REGIONS, sp.region),
    season: pick(SEASONS, sp.season),
    sort: pick(EXPLORE_SORTS, sp.sort) ?? "popular",
    page,
  };
  const e = t.explore;

  const supabase = await createClient();
  const [{ data: goals, error }, user] = await Promise.all([
    supabase.rpc("explore_goals", {
      p_locale: locale,
      p_category: filters.category,
      p_region: filters.region,
      p_season: filters.season,
      p_sort: filters.sort,
      // One extra row tells us whether there's a next page.
      p_limit: PAGE_SIZE + 1,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    getCurrentUser(),
  ]);
  if (error) throw new Error("Could not load goals");

  let nearMessage: string | null = null;
  if (filters.sort === "near" && goals.length === 0) {
    if (!user) nearMessage = e.nearSignIn;
    else {
      const { data: hasLocation } = await supabase.rpc("has_my_location");
      if (!hasLocation) nearMessage = e.nearNeedsLocation;
    }
  }
  const hasMore = goals.length > PAGE_SIZE;

  return (
    <>
      <nav aria-label={e.title} className="flex gap-1 rounded-full border p-1">
        {EXPLORE_SORTS.map((sort) => (
          <Link
            key={sort}
            href={exploreHref(locale, filters, { sort })}
            aria-current={filters.sort === sort ? "page" : undefined}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-center text-sm font-medium transition-colors",
              filters.sort === sort ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {e.sort[sort]}
          </Link>
        ))}
      </nav>

      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[null, ...GOAL_CATEGORIES].map((category) => (
          <li key={category ?? "all"} className="shrink-0">
            <Link
              href={exploreHref(locale, filters, { category })}
              aria-current={filters.category === category ? "true" : undefined}
              className={cn(
                "block rounded-full border px-3 py-1.5 text-sm whitespace-nowrap",
                filters.category === category ? "bg-foreground text-background border-foreground" : "hover:bg-accent",
              )}
            >
              {category ? t.categories[category] : e.allCategories}
            </Link>
          </li>
        ))}
      </ul>

      {/* Plain GET form: works without JavaScript and keeps the other filters. */}
      <form action={`/${locale}/explore`} className="flex flex-wrap items-end gap-2">
        {filters.sort !== "popular" && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-sm font-medium">
          {e.region}
          <NativeSelect name="region" defaultValue={filters.region ?? ""}>
            <option value="">{e.allRegions}</option>
            {GOAL_REGIONS.map((r) => (
              <option key={r} value={r}>
                {t.regions[r]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-sm font-medium">
          {e.season}
          <NativeSelect name="season" defaultValue={filters.season ?? ""}>
            <option value="">{e.anySeason}</option>
            {SEASONS.map((s) => (
              <option key={s} value={s}>
                {t.seasons[s]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="outline">
          {e.filter}
        </Button>
      </form>

      {nearMessage ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center">
          {nearMessage}{" "}
          <Link href={user ? `/${locale}/profile` : `/${locale}/login`} className="text-primary font-medium underline-offset-4 hover:underline">
            {user ? t.nav.profile : t.nav.signIn}
          </Link>
        </p>
      ) : goals.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center">{e.empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {goals.slice(0, PAGE_SIZE).map((goal) => (
            <GoalCard key={goal.goal_id} goal={goal} locale={locale} t={t} showDistance={filters.sort === "near"} />
          ))}
        </ul>
      )}

      {hasMore && (
        <Button asChild variant="outline" className="self-center">
          <Link href={exploreHref(locale, filters, { page: page + 1 })}>{e.more}</Link>
        </Button>
      )}
    </>
  );
}

function GoalCard({ goal, locale, t, showDistance }: { goal: ExploreGoal; locale: string; t: Messages; showDistance: boolean }) {
  const distance =
    showDistance && goal.distance_km !== null
      ? goal.distance_km < 10
        ? t.explore.nearby
        : format(t.explore.distance, { km: goal.distance_km.toLocaleString(locale) })
      : null;
  return (
    <li>
      <Link
        href={`/${locale}/goals/${goal.slug}`}
        className="group bg-card flex h-full flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-md"
      >
        <GoalArt category={goal.category_slug} photoUrl={goal.photo_url} className="h-24 w-full" emojiClassName="text-4xl" />
        <div className="flex flex-1 flex-col gap-1 p-3">
          <span className="text-sm leading-snug font-semibold group-hover:underline">{goal.title}</span>
          {goal.place_name && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <MapPin className="size-3 shrink-0" aria-hidden />
              {distance ?? goal.place_name}
            </span>
          )}
          {goal.wanted_count > 0 && (
            <span className="text-muted-foreground mt-auto pt-1 text-xs">
              {format(t.explore.wanted, { count: goal.wanted_count })}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
