import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Check, MapPin, MessageSquareText, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalArt } from "@/components/goal-art";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMonths } from "@/lib/months";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { format } from "@/i18n/format";
import { AddGoalButton } from "./add-goal-button";

const SLUG_RE = /^[a-z0-9-]{3,90}$/;

export async function generateMetadata({ params }: PageProps<"/[locale]/goals/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !SLUG_RE.test(slug)) return {};
  const supabase = await createClient();
  const { data } = await supabase.rpc("goal_details", { p_slug: slug, p_locale: locale });
  return data?.[0] ? { title: data[0].title, description: data[0].description ?? undefined } : {};
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

  const supabase = await createClient();
  const [{ data, error }, user] = await Promise.all([
    supabase.rpc("goal_details", { p_slug: slug, p_locale: locale }),
    getCurrentUser(),
  ]);
  if (error) throw new Error("Could not load goal");
  const goal = data[0];
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
          <p className="absolute right-2 bottom-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
            {format(g.photoCredit, { credit: goal.photo_credit })}
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

      <div>
        {goal.my_item_id ? (
          <Button asChild size="lg" variant="outline">
            <Link href={`/${locale}/items`}>
              <Check aria-hidden />
              {g.onYourList}
            </Link>
          </Button>
        ) : user ? (
          <AddGoalButton goalId={goal.goal_id} title={goal.title} locale={locale} t={{ label: g.addToList, errors: t.errors }} />
        ) : (
          <Button asChild size="lg">
            <Link href={`/${locale}/login`}>{g.signInToAdd}</Link>
          </Button>
        )}
      </div>

      {/* TODO(stories): list top posts for this goal once posts exist (design doc: posts, reactions). */}
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareText className="size-5" aria-hidden />
          {g.stories}
        </h2>
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">{g.storiesEmpty}</p>
      </section>

      {/* TODO(groups): list open groups for this goal once groups exist (design doc: groups, group_members). */}
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <UsersRound className="size-5" aria-hidden />
          {g.groups}
        </h2>
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">{g.groupsEmpty}</p>
      </section>
    </article>
  );
}
