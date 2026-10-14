"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FormError } from "@/components/form-message";
import { GoalSearch } from "@/components/goal-search";
import { createItem } from "@/lib/actions/items";
import { BUCKET_VISIBILITIES } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";

type Props = { locale: string; t: Pick<Messages, "items" | "errors" | "onboarding"> };

/**
 * Add a bucket-list item. Picking a suggestion links the item to that
 * canonical goal; free text is matched or becomes a new pending goal.
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
          <div className="flex flex-col gap-2 sm:max-w-48">
            <Label htmlFor="visibility">{t.items.fieldVisibility}</Label>
            <NativeSelect id="visibility" name="visibility" defaultValue={state.values?.visibility ?? "public"}>
              {BUCKET_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {t.items.visibility[v]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" disabled={pending || title.trim().length < 3} className="self-start">
            {t.items.add}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
