"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { createItem } from "@/lib/actions/items";
import { BUCKET_CATEGORIES, BUCKET_VISIBILITIES } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

/**
 * Form to add a bucket-list item. React resets the form after each submit;
 * on error, the typed values come back in state.values and are restored.
 */
export function NewItemForm({ t }: { t: Pick<Messages, "items" | "errors"> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createItem, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.items.newTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <FormError errorKey={state.error} errors={t.errors} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t.items.fieldTitle}</Label>
            <Input
              id="title"
              name="title"
              placeholder={t.items.fieldTitlePlaceholder}
              defaultValue={state.values?.title}
              required
              minLength={3}
              maxLength={140}
              aria-invalid={!!state.fieldErrors?.title}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">{t.items.fieldDescription}</Label>
            <Textarea id="description" name="description" maxLength={2000} defaultValue={state.values?.description} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">{t.items.fieldCategory}</Label>
              <NativeSelect id="category" name="category" defaultValue={state.values?.category ?? "other"}>
                {BUCKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t.items.category[c]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="placeName">{t.items.fieldPlace}</Label>
              <Input
                id="placeName"
                name="placeName"
                placeholder={t.items.fieldPlacePlaceholder}
                maxLength={120}
                defaultValue={state.values?.placeName}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="visibility">{t.items.fieldVisibility}</Label>
              <NativeSelect id="visibility" name="visibility" defaultValue={state.values?.visibility ?? "public"}>
                {BUCKET_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {t.items.visibility[v]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <Button type="submit" disabled={pending} className="self-start">
            {t.items.add}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
