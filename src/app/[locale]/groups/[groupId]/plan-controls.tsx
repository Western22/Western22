"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import {
  addChecklistItem,
  proposeDates,
  removeChecklistItem,
  removeDateOption,
  setChecklistDone,
  setDateVote,
  setGroupStatus,
  updatePlan,
} from "@/lib/actions/groups";
import { CHECKLIST_CATEGORIES, GROUP_STATUSES, type ChecklistCategory, type GroupStatus } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { ErrorKey, Messages } from "@/i18n/messages/en";
import { cn } from "@/lib/utils";

type T = { plan: Messages["groups"]["plan"]; status: Messages["groups"]["status"]; errors: Messages["errors"] };

/** Status steps; the owner can move between them. Completing asks for confirmation (it can't be undone). */
export function StatusControl({ groupId, status, isOwner, t }: { groupId: string; status: GroupStatus; isOwner: boolean; t: T }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorKey | undefined>();
  const current = GROUP_STATUSES.indexOf(status);

  function choose(next: GroupStatus) {
    if (next === status) return;
    if (next === "completed" && !window.confirm(t.plan.completeConfirm)) return;
    startTransition(async () => setError((await setGroupStatus(groupId, next)).error));
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex gap-1" aria-label={t.plan.status}>
        {GROUP_STATUSES.map((s, i) => (
          <li key={s} className="flex-1">
            <button
              type="button"
              disabled={!isOwner || pending || status === "completed"}
              onClick={() => choose(s)}
              aria-current={s === status ? "step" : undefined}
              className={cn(
                "w-full rounded-full border px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-default",
                s === status ? "bg-primary text-primary-foreground border-primary" : i < current ? "bg-primary/10 text-primary" : "",
                isOwner && status !== "completed" && s !== status && "hover:bg-accent",
              )}
            >
              {t.status[s]}
            </button>
          </li>
        ))}
      </ol>
      {!isOwner && status !== "completed" && <p className="text-muted-foreground text-xs">{t.plan.ownerOnlyStatus}</p>}
      <FormError errorKey={error} errors={t.errors} />
    </div>
  );
}

export function DateOptionActions({ optionId, voted, canRemove, t }: { optionId: string; voted: boolean; canRemove: boolean; t: T }) {
  const [pending, startTransition] = useTransition();
  return (
    <span className="ml-auto flex gap-1">
      <Button
        type="button"
        size="sm"
        variant={voted ? "default" : "outline"}
        aria-pressed={voted}
        disabled={pending}
        onClick={() => startTransition(() => setDateVote(optionId, !voted))}
      >
        {voted ? t.plan.unvote : t.plan.vote}
      </Button>
      {canRemove && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t.plan.remove}
          title={t.plan.remove}
          disabled={pending}
          onClick={() => startTransition(() => removeDateOption(optionId))}
        >
          <Trash2 />
        </Button>
      )}
    </span>
  );
}

export function ProposeDatesForm({ groupId, t }: { groupId: string; t: T }) {
  const [state, action, pending] = useActionState<FormState, FormData>(proposeDates, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="starts-on">{t.plan.from}</Label>
        <Input id="starts-on" name="startsOn" type="date" required className="w-40" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ends-on">{t.plan.to}</Label>
        <Input id="ends-on" name="endsOn" type="date" className="w-40" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {t.plan.propose}
      </Button>
      <div className="w-full">
        <FormError errorKey={state.error} errors={t.errors} />
      </div>
    </form>
  );
}

export function PlanDetailsForm({
  groupId,
  defaults,
  t,
}: {
  groupId: string;
  defaults: { location: string; budget: string; currency: string; notes: string };
  t: T;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePlan, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <FormError errorKey={state.error} errors={t.errors} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-location">{t.plan.location}</Label>
        <Input id="plan-location" name="location" maxLength={120} placeholder={t.plan.locationPlaceholder} defaultValue={defaults.location} />
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-budget">{t.plan.budget}</Label>
          <Input id="plan-budget" name="budget" type="number" min={0} step={1} inputMode="numeric" defaultValue={defaults.budget} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-currency">{t.plan.currency}</Label>
          <Input id="plan-currency" name="currency" maxLength={3} defaultValue={defaults.currency} className="uppercase" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-notes">{t.plan.notes}</Label>
        <Textarea id="plan-notes" name="notes" maxLength={1000} defaultValue={defaults.notes} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {t.plan.save}
        </Button>
        {state.ok && (
          <p role="status" className="text-muted-foreground text-sm">
            {t.plan.saved}
          </p>
        )}
      </div>
    </form>
  );
}

export function ChecklistRow({
  item,
  doneByName,
  canRemove,
  t,
}: {
  item: { id: string; title: string; done: boolean };
  doneByName: string | null;
  canRemove: boolean;
  t: T;
}) {
  const [pending, startTransition] = useTransition();
  // Tick immediately; the server refresh then confirms it.
  const [done, setDone] = useOptimistic(item.done);
  const id = `check-${item.id}`;
  return (
    <li className="flex items-center gap-2 rounded-lg px-1 py-1">
      <input
        id={id}
        type="checkbox"
        checked={done}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            setDone(next);
            await setChecklistDone(item.id, next);
          });
        }}
        className="accent-primary size-4"
      />
      <label htmlFor={id} className={cn("flex-1 text-sm", done && "text-muted-foreground line-through")}>
        {item.title}
        {done && doneByName && <span className="text-muted-foreground ml-1 text-xs no-underline">· {doneByName}</span>}
      </label>
      {canRemove && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={`${t.plan.remove}: ${item.title}`}
          disabled={pending}
          onClick={() => startTransition(() => removeChecklistItem(item.id))}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </li>
  );
}

export function ChecklistAddForm({ groupId, t }: { groupId: string; t: T }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addChecklistItem, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <Input name="title" required maxLength={120} placeholder={t.plan.itemPlaceholder} aria-label={t.plan.itemPlaceholder} className="min-w-40 flex-1" />
      <NativeSelect name="category" defaultValue={"other" satisfies ChecklistCategory} aria-label={t.plan.category} className="w-32">
        {CHECKLIST_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t.plan.categories[c]}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="outline" disabled={pending}>
        {t.plan.add}
      </Button>
      <div className="w-full">
        <FormError errorKey={state.error} errors={t.errors} />
      </div>
    </form>
  );
}
