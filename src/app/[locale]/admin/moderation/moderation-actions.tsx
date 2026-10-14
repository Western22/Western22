"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { moderate } from "@/lib/actions/safety";
import type { ModerationAction, ReportTargetType } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

/** Dismiss, warn, remove content or suspend, for one queue item. */
export function ModerationActions({
  targetType,
  targetId,
  canRemove,
  canSuspend,
  suspended,
  t,
}: {
  targetType: ReportTargetType;
  targetId: string;
  canRemove: boolean;
  canSuspend: boolean;
  suspended: boolean;
  t: { admin: Messages["admin"]; errors: Messages["errors"] };
}) {
  const a = t.admin;
  const [state, action, pending] = useActionState<FormState, FormData>(moderate, {});
  const id = `mod-${targetType}-${targetId}`;

  if (state.ok) {
    return (
      <p role="status" className="font-medium">
        {a.done}
      </p>
    );
  }

  // Each button submits the same form with its own action value; destructive ones confirm first.
  const button = (value: ModerationAction, variant: "default" | "outline" | "destructive", confirmText?: string) => (
    <Button
      type="submit"
      name="action"
      value={value}
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {a.actions[value]}
    </Button>
  );

  return (
    <form action={action} className="flex flex-col gap-2 border-t pt-3">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-note`}>{a.note}</Label>
        <Textarea id={`${id}-note`} name="note" rows={2} maxLength={500} placeholder={a.notePlaceholder} />
      </div>
      {canSuspend && !suspended && (
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-days`}>{a.days}</Label>
          <NativeSelect id={`${id}-days`} name="days" defaultValue="7">
            <option value="1">{a.dayOptions["1"]}</option>
            <option value="7">{a.dayOptions["7"]}</option>
            <option value="30">{a.dayOptions["30"]}</option>
            <option value="">{a.dayOptions.forever}</option>
          </NativeSelect>
        </div>
      )}
      <FormError errorKey={state.error} errors={t.errors} />
      <div className="flex flex-wrap gap-2">
        {button("dismiss", "outline")}
        {canSuspend && button("warn", "outline")}
        {canRemove && button("remove", "destructive", a.confirmRemove)}
        {canSuspend && !suspended && button("suspend", "destructive", a.confirmSuspend)}
        {canSuspend && suspended && button("unsuspend", "outline")}
      </div>
    </form>
  );
}
