"use client";

import { useActionState, useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { reportContent } from "@/lib/actions/safety";
import { REPORT_REASONS, type ReportTargetType } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/en";

export type ReportT = { report: Messages["report"]; errors: Messages["errors"] };

/**
 * "Report" on any person, message, story, comment or group. Opens a small
 * form: a reason, optional details, and (when there's a person behind it)
 * "Also block them". Reports are anonymous.
 */
export function ReportButton({
  targetType,
  targetId,
  blockUser,
  t,
  className,
}: {
  targetType: ReportTargetType;
  targetId: string;
  /** The person behind the content, offered as "Also block {name}". */
  blockUser?: { id: string; name: string };
  t: ReportT;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(reportContent, {});
  const r = t.report;
  const formId = `report-${targetType}-${targetId}`;

  if (state.ok) {
    return (
      <p role="status" className="text-muted-foreground text-xs">
        {r.done}
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "text-muted-foreground flex items-center gap-1 text-xs hover:underline"}
      >
        <Flag className="size-3" aria-hidden />
        {r.button}
      </button>
    );
  }
  return (
    <form action={action} aria-label={r.title[targetType]} className="bg-muted/50 flex w-full flex-col gap-2 rounded-lg border p-3 text-sm">
      <p className="font-medium">{r.title[targetType]}</p>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${formId}-reason`}>{r.reason}</Label>
        <NativeSelect id={`${formId}-reason`} name="reason" defaultValue="spam">
          {REPORT_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {r.reasons[reason]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${formId}-details`}>{r.details}</Label>
        <Textarea id={`${formId}-details`} name="details" maxLength={500} rows={2} defaultValue={state.values?.details} />
      </div>
      {blockUser && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="block" className="accent-primary" />
          <input type="hidden" name="blockUserId" value={blockUser.id} />
          {format(r.blockToo, { name: blockUser.name })}
        </label>
      )}
      <p className="text-muted-foreground text-xs">{r.emergency}</p>
      <FormError errorKey={state.error} errors={t.errors} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {r.submit}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {r.cancel}
        </Button>
      </div>
    </form>
  );
}
