"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { createGroup } from "@/lib/actions/groups";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

const SIZES = Array.from({ length: 19 }, (_, i) => i + 2);

/** Start a group for a goal; on success the action redirects into the new group. */
export function CreateGroupForm({
  goalId,
  locale,
  t,
}: {
  goalId: string;
  locale: string;
  t: { groups: Messages["groups"]; errors: Messages["errors"] };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createGroup, {});
  const g = t.groups;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="locale" value={locale} />
      <FormError errorKey={state.error} errors={t.errors} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="group-name">{g.name}</Label>
        <Input id="group-name" name="name" required maxLength={80} placeholder={g.namePlaceholder} defaultValue={state.values?.name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="group-description">{g.description}</Label>
        <Textarea id="group-description" name="description" maxLength={500} defaultValue={state.values?.description} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="group-size">{g.maxSize}</Label>
          <NativeSelect id="group-size" name="maxSize" defaultValue="6">
            {SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="group-policy">{g.joinPolicy}</Label>
          <NativeSelect id="group-policy" name="joinPolicy" defaultValue="open">
            <option value="open">{g.policy.open}</option>
            <option value="request">{g.policy.request}</option>
          </NativeSelect>
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {g.create}
        </Button>
      </div>
    </form>
  );
}
