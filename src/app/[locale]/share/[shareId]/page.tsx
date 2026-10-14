import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { format } from "@/i18n/format";

// The trusted contact's link: don't index it.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * What a trusted contact sees from "Share my plan": a read-only summary of
 * the group's plan. No sign-in; the unguessable link is the key, and it
 * stops working when it expires or is revoked (shared_plan, migration 0009).
 */
export default function SharedPlanPage({ params }: PageProps<"/[locale]/share/[shareId]">) {
  return (
    <Suspense fallback={null}>
      <SharedPlan params={params} />
    </Suspense>
  );
}

async function SharedPlan({ params }: { params: PageProps<"/[locale]/share/[shareId]">["params"] }) {
  const { locale, shareId } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);
  const sp = t.sharedPlan;
  const valid = /^[0-9a-f-]{36}$/i.test(shareId);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("shared_plan", { p_share_id: shareId, p_locale: locale }) : { data: null };
  const plan = data?.[0];
  if (!plan) {
    return <p className="text-muted-foreground py-10 text-center">{sp.notFound}</p>;
  }
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const range = (from: string, to: string) =>
    from === to ? dateFormat.format(new Date(from)) : dateFormat.formatRange(new Date(from), new Date(to));

  return (
    <article className="flex flex-col gap-5 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-balance">{format(sp.title, { name: plan.sharer_name })}</h1>
        <p className="text-muted-foreground text-pretty">{format(sp.intro, { name: plan.sharer_name, app: t.app.name })}</p>
      </header>
      <dl className="bg-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border p-4 text-sm">
        <dt className="text-muted-foreground">{sp.goal}</dt>
        <dd className="font-medium">{plan.goal_title}</dd>
        <dt className="text-muted-foreground">{sp.group}</dt>
        <dd>{plan.group_name}</dd>
        <dt className="text-muted-foreground">{sp.status}</dt>
        <dd>{t.groups.status[plan.status]}</dd>
        {plan.location && (
          <>
            <dt className="text-muted-foreground">{sp.where}</dt>
            <dd>{plan.location}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{sp.dates}</dt>
        <dd>
          {plan.dates.length === 0 ? (
            sp.noDates
          ) : (
            <ul className="flex flex-col gap-0.5">
              {plan.dates.slice(0, 3).map((d) => (
                <li key={`${d.starts_on}-${d.ends_on}`}>
                  {range(d.starts_on, d.ends_on)} <span className="text-muted-foreground">· {format(sp.votes, { count: d.votes })}</span>
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt className="text-muted-foreground">{sp.whosGoing}</dt>
        <dd>{plan.members.join(", ")}</dd>
      </dl>
      <p className="flex gap-2 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {format(sp.worried, { name: plan.sharer_name })}
      </p>
      <p className="text-muted-foreground text-xs">
        {format(sp.expires, { date: new Date(plan.expires_at).toLocaleDateString(locale, { dateStyle: "medium" }) })}
      </p>
    </article>
  );
}
