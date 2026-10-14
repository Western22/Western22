import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedProfile } from "@/lib/auth";
import { SafetyTips } from "@/components/safety/safety-tips";
import { createClient } from "@/lib/supabase/server";
import type { MatchRequest } from "@/lib/supabase/database.types";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { RespondButtons } from "./respond-buttons";

export async function generateMetadata({ params }: PageProps<"/[locale]/requests">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: (await getMessages(locale)).requests.title } : {};
}

/** "Let's do this together" requests: waiting for you, sent, and accepted. */
export default async function RequestsPage({ params }: PageProps<"/[locale]/requests">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-bold tracking-tight">{t.requests.title}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <Requests locale={locale} t={t} />
      </Suspense>
    </div>
  );
}

async function Requests({ locale, t }: { locale: Locale; t: Messages }) {
  await requireOnboardedProfile(locale);
  const supabase = await createClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.rpc("my_match_requests", { p_locale: locale }),
    supabase.from("profile_settings").select("safety_tips_seen_at").maybeSingle(),
  ]);
  if (error) throw new Error("Could not load requests");
  const r = t.requests;

  if (data.length === 0) return <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center">{r.empty}</p>;

  const received = data.filter((q) => q.direction === "received" && q.status === "pending");
  const together = data.filter((q) => q.status === "accepted");
  // Requests you declined drop out of view; ones others declined stay in Sent.
  const sent = data.filter((q) => q.direction === "sent" && q.status !== "accepted");

  return (
    <>
      {/* Before a first meetup: once someone has agreed to do a goal together. */}
      {together.length > 0 && !settings?.safety_tips_seen_at && <SafetyTips locale={locale} t={t.safety} />}
      <Section title={r.received} items={received} locale={locale} t={t} />
      <Section title={r.together} items={together} locale={locale} t={t} />
      <Section title={r.sent} items={sent} locale={locale} t={t} />
    </>
  );
}

function Section({ title, items, locale, t }: { title: string; items: MatchRequest[]; locale: Locale; t: Messages }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-muted-foreground font-normal">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.requests.emptySection}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((q) => (
            <RequestCard key={q.id} q={q} locale={locale} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestCard({ q, locale, t }: { q: MatchRequest; locale: Locale; t: Messages }) {
  const r = t.requests;
  const name = q.other_display_name || `@${q.other_username}`;
  const goal = (
    <Link href={`/${locale}/goals/${q.goal_slug}`} className="font-medium underline-offset-4 hover:underline">
      {q.goal_title}
    </Link>
  );
  // Split the message around {goal} so the goal can be a link.
  const template = q.status === "accepted" ? r.with : q.direction === "received" ? r.wantsTo : r.youAsked;
  const [before, after] = template.split("{goal}");

  return (
    <li className="bg-card flex flex-col gap-2 rounded-2xl border p-4">
      <div className="flex items-center gap-3">
        {q.other_avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
          <img src={q.other_avatar_url} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div aria-hidden className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full font-semibold">
            {name.replace("@", "").charAt(0).toUpperCase()}
          </div>
        )}
        <p className="min-w-0 flex-1 text-sm">
          {q.other_username ? (
            <Link href={`/${locale}/u/${q.other_username}`} className="font-semibold underline-offset-4 hover:underline">
              {name}
            </Link>
          ) : (
            <span className="font-semibold">{name}</span>
          )}{" "}
          <span className="text-muted-foreground">
            {before}
            {goal}
            {after}
          </span>
        </p>
      </div>
      {q.note && <blockquote className="bg-muted rounded-lg px-3 py-2 text-sm break-words">{q.note}</blockquote>}
      {q.direction === "received" && q.status === "pending" ? (
        <RespondButtons requestId={q.id} name={name} t={{ accept: r.accept, decline: r.decline, errors: t.errors }} />
      ) : q.status === "pending" ? (
        <p className="text-muted-foreground text-sm">{r.pending}</p>
      ) : q.status === "declined" ? (
        <p className="text-muted-foreground text-sm">{r.declined}</p>
      ) : q.status === "accepted" ? (
        <Link href={`/${locale}/goals/${q.goal_slug}#groups`} className="text-primary self-start text-sm font-medium hover:underline">
          {t.matches.startGroup}
        </Link>
      ) : null}
    </li>
  );
}
