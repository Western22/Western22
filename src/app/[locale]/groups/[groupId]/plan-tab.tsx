import { createClient } from "@/lib/supabase/server";
import { CHECKLIST_CATEGORIES } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import type { GroupContext } from "./page";
import { SafetyTips } from "@/components/safety/safety-tips";
import { getExchangeRates, getViewerRegion } from "@/lib/region-server";
import { convertedAmount } from "@/lib/region";
import { SharePlan } from "@/components/safety/share-plan";
import { ChecklistAddForm, ChecklistRow, DateOptionActions, PlanDetailsForm, ProposeDatesForm, StatusControl } from "./plan-controls";

/** Plan tab: status, proposed dates with votes, where and how much, and a shared checklist. */
export async function PlanTab({ ctx, locale, t }: { ctx: GroupContext; locale: Locale; t: Messages }) {
  const supabase = await createClient();
  const [{ data: plan }, { data: options }, { data: checklist }, { data: members }, { data: settings }, { data: shares }] = await Promise.all([
    supabase.from("group_plans").select("location_text, budget_amount, budget_currency, notes").eq("group_id", ctx.id).maybeSingle(),
    supabase
      .from("group_date_options")
      .select("id, starts_on, ends_on, proposed_by, votes:group_date_votes(user_id)")
      .eq("group_id", ctx.id)
      .order("starts_on"),
    supabase.from("group_checklist_items").select("id, title, category, done, done_by, created_by").eq("group_id", ctx.id).order("created_at"),
    supabase.from("group_members").select("user_id, profile:profiles(display_name, username)").eq("group_id", ctx.id),
    supabase.from("profile_settings").select("safety_tips_seen_at").eq("user_id", ctx.me).maybeSingle(),
    supabase
      .from("plan_shares")
      .select("id, contact_name, expires_at")
      .eq("group_id", ctx.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);
  // Safety tips before a first meetup: once the group is getting real, until acknowledged.
  const showTips = (ctx.status === "planning" || ctx.status === "confirmed") && !settings?.safety_tips_seen_at;
  const p = t.groups.plan;
  const names = new Map((members ?? []).map((m) => [m.user_id, m.profile?.display_name || `@${m.profile?.username ?? "?"}`]));
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const range = (from: string, to: string) =>
    from === to ? dateFormat.format(new Date(from)) : dateFormat.formatRange(new Date(from), new Date(to));
  const sortedOptions = [...(options ?? [])].sort((a, b) => b.votes.length - a.votes.length || a.starts_on.localeCompare(b.starts_on));
  const tPlan = { plan: p, status: t.groups.status, errors: t.errors };
  // The group's budget in the viewer's own currency, when it differs.
  const [region, rates] = await Promise.all([getViewerRegion(locale), getExchangeRates()]);
  const budgetInMine =
    plan?.budget_amount != null && plan.budget_currency
      ? convertedAmount(Number(plan.budget_amount), plan.budget_currency, region, rates, t.items.budgetRange.approx)
      : null;

  return (
    <div className="flex flex-col gap-6">
      {showTips && <SafetyTips locale={locale} t={t.safety} />}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{p.status}</h2>
        <StatusControl groupId={ctx.id} status={ctx.status} isOwner={ctx.isOwner} t={tPlan} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{p.dates}</h2>
        {sortedOptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{p.datesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedOptions.map((o) => {
              const voted = o.votes.some((v) => v.user_id === ctx.me);
              return (
                <li key={o.id} className="bg-card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-3">
                  <span className="font-medium">{range(o.starts_on, o.ends_on)}</span>
                  <span className="text-muted-foreground text-sm">
                    {format(p.votes, { count: o.votes.length }, locale)}
                    {o.votes.length > 0 && <> · {o.votes.map((v) => names.get(v.user_id) ?? "?").join(", ")}</>}
                  </span>
                  <DateOptionActions
                    optionId={o.id}
                    voted={voted}
                    canRemove={o.proposed_by === ctx.me || ctx.isOwner}
                    t={tPlan}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {ctx.status !== "completed" && <ProposeDatesForm groupId={ctx.id} t={tPlan} />}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{p.details}</h2>
        <PlanDetailsForm
          groupId={ctx.id}
          defaults={{
            location: plan?.location_text ?? "",
            budget: plan?.budget_amount?.toString() ?? "",
            currency: plan?.budget_currency ?? "USD",
            notes: plan?.notes ?? "",
          }}
          t={tPlan}
        />
        {budgetInMine && (
          <p className="text-muted-foreground text-sm" data-testid="budget-converted">
            {format(p.budgetInYourCurrency, { amount: budgetInMine }, locale)}
          </p>
        )}
        <p className="text-muted-foreground text-xs">{t.safety.publicPlaces}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{p.checklist}</h2>
        {(checklist ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{p.checklistEmpty}</p>
        ) : (
          CHECKLIST_CATEGORIES.map((cat) => {
            const items = (checklist ?? []).filter((i) => i.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="flex flex-col gap-1">
                <h3 className="text-muted-foreground text-sm font-medium">{p.categories[cat]}</h3>
                <ul className="flex flex-col gap-1">
                  {items.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      doneByName={item.done_by ? (names.get(item.done_by) ?? null) : null}
                      canRemove={item.created_by === ctx.me || ctx.isOwner}
                      t={tPlan}
                    />
                  ))}
                </ul>
              </div>
            );
          })
        )}
        <ChecklistAddForm groupId={ctx.id} t={tPlan} />
      </section>

      {ctx.status !== "completed" && (
        <SharePlan groupId={ctx.id} groupName={ctx.name} shares={shares ?? []} locale={locale} t={{ safety: t.safety, errors: t.errors }} />
      )}
    </div>
  );
}
