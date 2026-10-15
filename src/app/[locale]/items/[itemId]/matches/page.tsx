import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/seo";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Clock, Inbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MATCH_CONFIG, MATCH_LIMIT } from "@/lib/matching/config";
import { matchReasons } from "@/lib/matching/reasons";
import { getViewerRegion } from "@/lib/region-server";
import type { Match } from "@/lib/supabase/database.types";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { RequestForm } from "./request-form";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/[locale]/items/[itemId]/matches">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { ...PRIVATE_PAGE, title: (await getMessages(locale)).matches.findBuddies } : {};
}

/** Ranked buddies for one of the caller's items. Everything depends on the session, so it streams. */
export default function MatchesPage({ params }: PageProps<"/[locale]/items/[itemId]/matches">) {
  return (
    <Suspense fallback={<div aria-hidden className="bg-muted/60 h-64 animate-pulse rounded-3xl" />}>
      <Matches params={params} />
    </Suspense>
  );
}

async function Matches({ params }: { params: PageProps<"/[locale]/items/[itemId]/matches">["params"] }) {
  const { locale, itemId } = await params;
  if (!isLocale(locale) || !UUID_RE.test(itemId)) notFound();
  const t = await getMessages(locale);
  const user = await requireOnboardedProfile(locale);

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("bucket_items")
    .select("id, goal_id, timeframe, budget, goal:goals(slug)")
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!item) notFound();

  const [{ data: matches, error }, { data: goalTitle }, { data: hasLocation }, region] = await Promise.all([
    supabase.rpc("find_matches", { p_item_id: item.id, p_config: MATCH_CONFIG, p_limit: MATCH_LIMIT }),
    supabase.rpc("goal_title", { p_goal_id: item.goal_id, p_locale: locale }),
    supabase.rpc("has_my_location"),
    getViewerRegion(locale),
  ]);
  if (error) throw new Error("Could not load matches");
  const m = t.matches;

  return (
    <div className="flex flex-col gap-5 pb-10">
      <Link
        href={`/${locale}/items`}
        className="text-muted-foreground flex items-center gap-1 self-start text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {m.backToList}
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{format(m.title, { goal: goalTitle ?? "" }, locale)}</h1>
        <p className="text-muted-foreground">{m.subtitle}</p>
        {item.goal && (
          <Link href={`/${locale}/goals/${item.goal.slug}`} className="text-primary text-sm underline-offset-4 hover:underline">
            {m.goalPage}
          </Link>
        )}
      </div>

      {!hasLocation && (
        <p className="bg-muted rounded-lg px-3 py-2 text-sm">
          {m.noLocationHint}{" "}
          <Link href={`/${locale}/profile`} className="font-medium underline-offset-4 hover:underline">
            {t.nav.profile}
          </Link>
        </p>
      )}

      {matches.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center">{m.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((match) => (
            <MatchCard
              key={match.profile_id}
              match={match}
              reasons={matchReasons(match, item, t, region)}
              myItemId={item.id}
              locale={locale}
              t={t}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchCard({
  match,
  reasons,
  myItemId,
  locale,
  t,
}: {
  match: Match;
  reasons: string[];
  myItemId: string;
  locale: Locale;
  t: Messages;
}) {
  const m = t.matches;
  const name = match.display_name || `@${match.username}`;
  const place = [match.home_city, match.home_country].filter(Boolean).join(", ");

  return (
    <li className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-center gap-3">
        {match.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
          <img src={match.avatar_url} alt="" width={48} height={48} loading="lazy" className="size-12 shrink-0 rounded-full object-cover" />
        ) : (
          <div aria-hidden className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold">
            {name.replace("@", "").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            {match.username ? (
              <Link href={`/${locale}/u/${match.username}`} className="underline-offset-4 hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
          </h2>
          {place && <p className="text-muted-foreground truncate text-sm">{place}</p>}
        </div>
        <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold">
          {format(m.score, { score: match.score }, locale)}
        </span>
      </div>

      {reasons.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {reasons.map((reason) => (
            <li key={reason} className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium">
              {reason}
            </li>
          ))}
        </ul>
      )}

      <RequestState match={match} myItemId={myItemId} name={name} locale={locale} t={t} />
    </li>
  );
}

/** What the card offers depends on any request between the two people for this goal. */
function RequestState({ match, myItemId, name, locale, t }: { match: Match; myItemId: string; name: string; locale: Locale; t: Messages }) {
  const m = t.matches;
  const status = match.request_status;
  const sent = match.request_direction === "sent";
  const line = "flex items-center gap-1.5 text-sm font-medium";

  if (!status || status === "cancelled") {
    return <RequestForm myItemId={myItemId} theirItemId={match.their_item_id} name={name} t={{ matches: m, errors: t.errors }} />;
  }
  if (status === "accepted") {
    return (
      <p className="text-primary flex items-center gap-1.5 text-sm font-medium">
        <Check className="size-4" aria-hidden />
        {m.buddies}
      </p>
    );
  }
  if (status === "pending" && sent) {
    return (
      <p className={`text-muted-foreground ${line}`}>
        <Clock className="size-4" aria-hidden />
        {m.sent}
      </p>
    );
  }
  if (status === "pending") {
    return (
      <div className="flex items-center gap-3">
        <p className={line}>
          <Inbox className="size-4" aria-hidden />
          {m.theyAsked}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={`/${locale}/requests`}>{m.answer}</Link>
        </Button>
      </div>
    );
  }
  return (
    <p className={`text-muted-foreground ${line}`}>
      <X className="size-4" aria-hidden />
      {sent ? m.declinedByThem : m.declinedByYou}
    </p>
  );
}
