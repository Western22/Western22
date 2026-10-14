"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-message";
import { GoalSearch } from "@/components/goal-search";
import { createItem } from "@/lib/actions/items";
import {
  BUCKET_BUDGETS,
  BUCKET_FLEXIBILITIES,
  BUCKET_TIMEFRAMES,
  BUCKET_VISIBILITIES,
} from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { ItemFields } from "./item-fields";

type Props = { locale: string; t: Pick<Messages, "items" | "errors" | "onboarding"> };

/** An echoed form value if it's one of `options`, else the fallback. */
function oneOf<T extends string>(options: readonly T[], value: string | undefined, fallback: T): T {
  return options.find((o) => o === value) ?? fallback;
}

/**
 * Add a bucket-list item from free text. Picking a suggestion links it to that
 * goal; otherwise the server matches the text (exactly or fuzzily) or creates
 * a new goal for review, and says which happened.
 */
export function NewItemForm({ locale, t }: Props) {
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await createItem(prev, formData);
    if (result.ok) {
      setTitle("");
      setGoalId(null);
    }
    return result;
  }, {});
  const v = state.values ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.items.newTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="goalId" value={goalId ?? ""} />
          <FormError errorKey={state.error} errors={t.errors} />
          {state.added && (
            <p role="status" className="bg-accent rounded-md px-3 py-2 text-sm">
              {format(t.items.match[state.added.match], { goal: state.added.goalTitle })}{" "}
              {state.added.goalSlug && (
                <Link
                  href={`/${locale}/goals/${state.added.goalSlug}`}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {t.items.viewGoal}
                </Link>
              )}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t.items.fieldTitle}</Label>
            <GoalSearch
              id="title"
              name="title"
              locale={locale}
              value={title}
              placeholder={t.items.fieldTitlePlaceholder}
              wantedLabel={(count) => format(t.onboarding.dreams.wanted, { count })}
              onChange={(text) => {
                setTitle(text);
                setGoalId(null);
              }}
              onSelect={(goal) => {
                setTitle(goal.title);
                setGoalId(goal.goal_id);
              }}
            />
          </div>
          <details className="group">
            <summary className="text-muted-foreground flex cursor-pointer list-none items-center gap-1 text-sm font-medium">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              {t.items.details}
            </summary>
            <div className="pt-3">
              <ItemFields
                idPrefix="new"
                t={t.items}
                defaults={{
                  timeframe: oneOf(BUCKET_TIMEFRAMES, v.timeframe, "someday"),
                  flexibility: oneOf(BUCKET_FLEXIBILITIES, v.flexibility, "flexible"),
                  budget: BUCKET_BUDGETS.find((b) => b === v.budget) ?? null,
                  visibility: oneOf(BUCKET_VISIBILITIES, v.visibility, "public"),
                }}
              />
            </div>
          </details>
          <Button type="submit" disabled={pending || title.trim().length < 3} className="self-start">
            {t.items.add}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
