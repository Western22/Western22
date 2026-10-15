import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRIVATE_PAGE } from "@/lib/seo";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { cn } from "@/lib/utils";

export const metadata = { ...PRIVATE_PAGE };

const RANGES = ["7", "30", "90", "all"] as const;
type Range = (typeof RANGES)[number];

/**
 * Growth funnel (moderators only): of the people who signed up in the chosen
 * period, how many reached each step. Numbers come from public.funnel_events,
 * written by database triggers (migration 0012); everyone else gets a 404.
 */
export default async function FunnelPage({ params, searchParams }: PageProps<"/[locale]/admin/funnel">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);
  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="text-2xl font-bold tracking-tight">{t.funnel.title}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <Report locale={locale} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Report({
  locale,
  t,
  searchParams,
}: {
  locale: Locale;
  t: Messages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOnboardedProfile(locale);
  const supabase = await createClient();
  const { data: isModerator } = await supabase.rpc("is_moderator");
  if (!isModerator) notFound();

  const raw = (await searchParams).days;
  const range: Range = RANGES.includes(raw as Range) ? (raw as Range) : "30";
  const to = new Date();
  const from = range === "all" ? new Date(0) : new Date(to.getTime() - Number(range) * 86_400_000);
  const { data: rows, error } = await supabase.rpc("funnel_report", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error || !rows) throw new Error("Could not load the funnel");

  const f = t.funnel;
  const signups = rows[0]?.people ?? 0;
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat(locale);
  const share = (part: number, whole: number) => (whole > 0 ? pct.format(part / whole) : "–");

  return (
    <>
      <p className="text-muted-foreground text-sm">{f.intro}</p>
      <nav aria-label={f.rangeLabel} className="flex gap-1 rounded-full border p-1">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/${locale}/admin/funnel${r === "30" ? "" : `?days=${r}`}`}
            aria-current={range === r ? "page" : undefined}
            className={cn(
              "flex-1 rounded-full px-2 py-1.5 text-center text-sm font-medium",
              range === r ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {f.ranges[r]}
          </Link>
        ))}
      </nav>
      {signups === 0 ? (
        <p className="text-muted-foreground">{f.empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th scope="col" className="py-2 font-medium">{f.step}</th>
              <th scope="col" className="py-2 text-right font-medium">{f.people}</th>
              <th scope="col" className="py-2 text-right font-medium">{f.ofSignups}</th>
              <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">{f.ofPrevious}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.step} className="border-b last:border-0">
                <th scope="row" className="py-2 text-left font-normal">
                  {f.steps[row.step]}
                  {/* Bar for a quick visual read; the numbers carry the meaning. */}
                  <span aria-hidden className="bg-muted mt-1 block h-1.5 rounded-full">
                    <span className="bg-primary block h-1.5 rounded-full" style={{ width: `${(row.people / signups) * 100}%` }} />
                  </span>
                </th>
                <td className="py-2 text-right tabular-nums">{num.format(row.people)}</td>
                <td className="py-2 text-right tabular-nums">{share(row.people, signups)}</td>
                <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                  {i === 0 ? "–" : share(row.people, rows[i - 1].people)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
