"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ChevronDown, Lock, Trash2, UserRoundSearch, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FormError } from "@/components/form-message";
import { deleteItem, updateItem } from "@/lib/actions/items";
import { BUCKET_STATUSES, type BucketItem, type GoalStatus } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";
import { cn } from "@/lib/utils";
import { ItemFields } from "./item-fields";

export type ItemRowData = Pick<BucketItem, "id" | "title" | "status" | "visibility" | "timeframe" | "flexibility" | "budget"> & {
  goal: { slug: string; status: GoalStatus } | null;
};

const STATUS_STYLE: Record<BucketItem["status"], string> = {
  dreaming: "bg-muted text-muted-foreground",
  planning: "bg-primary/10 text-primary",
  done: "bg-emerald-100 text-emerald-800",
};

/** One of the owner's items: summary chips, an editable details panel, and delete. */
export function ItemRow({ item, locale, t }: { item: ItemRowData; locale: string; t: Pick<Messages, "items" | "errors"> & { findBuddies: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateItem, {});
  const done = item.status === "done";
  const it = t.items;
  // Matching needs a live goal other people can share; done items aren't matched.
  const canMatch = !done && (item.goal?.status === "active" || item.goal?.status === "merged");

  return (
    <li className="rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {item.goal ? (
            <Link
              href={`/${locale}/goals/${item.goal.slug}`}
              className={cn("font-medium break-words underline-offset-4 hover:underline", done && "text-muted-foreground line-through")}
            >
              {item.title}
            </Link>
          ) : (
            <p className="font-medium break-words">{item.title}</p>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_STYLE[item.status])}>{it.status[item.status]}</span>
            <span>{it.timeframe[item.timeframe]}</span>
            {item.budget && <span>{it.budget[item.budget]}</span>}
            {item.visibility !== "public" && (
              <span className="flex items-center gap-1">
                {item.visibility === "private" ? <Lock className="size-3" aria-hidden /> : <Users className="size-3" aria-hidden />}
                {it.visibility[item.visibility]}
              </span>
            )}
            {item.goal?.status === "pending" && <span className="italic">{it.pendingReview}</span>}
          </div>
        </div>
        <form action={deleteItem.bind(null, item.id)}>
          <Button type="submit" variant="ghost" size="icon" aria-label={`${it.delete}: ${item.title}`} title={it.delete}>
            <Trash2 />
          </Button>
        </form>
      </div>

      <div className="mt-2 flex items-start gap-3">
      <details className="group min-w-0 flex-1">
        <summary className="text-muted-foreground flex cursor-pointer list-none items-center gap-1 text-sm font-medium">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          {it.details}
        </summary>
        <form action={action} className="flex flex-col gap-3 pt-3">
          <input type="hidden" name="itemId" value={item.id} />
          <FormError errorKey={state.error} errors={t.errors} />
          <div className="flex flex-col gap-1.5 sm:max-w-[calc(50%-0.375rem)]">
            <Label htmlFor={`${item.id}-status`}>{it.fieldStatus}</Label>
            <NativeSelect id={`${item.id}-status`} name="status" defaultValue={item.status}>
              {BUCKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {it.status[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <ItemFields idPrefix={item.id} t={it} defaults={item} />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {it.save}
            </Button>
            {state.ok && (
              <p role="status" className="text-muted-foreground text-sm">
                {it.saved}
              </p>
            )}
          </div>
        </form>
      </details>
        {canMatch && (
          <Link
            href={`/${locale}/items/${item.id}/matches`}
            className="text-primary flex shrink-0 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            <UserRoundSearch className="size-4" aria-hidden />
            {t.findBuddies}
          </Link>
        )}
      </div>
    </li>
  );
}
