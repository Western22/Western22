"use client";

import { useActionState, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { sendMatchRequest } from "@/lib/actions/matching";
import { MATCH_NOTE_MAX } from "@/lib/matching/config";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

/** "Let's do this together": opens a short note box, then sends the request. */
export function RequestForm({
  myItemId,
  theirItemId,
  name,
  t,
}: {
  myItemId: string;
  theirItemId: string;
  name: string;
  t: { matches: Messages["matches"]; errors: Messages["errors"] };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(sendMatchRequest, {});
  const m = t.matches;
  const noteId = `note-${theirItemId}`;

  if (state.ok) {
    return (
      <p role="status" className="text-primary text-sm font-medium">
        {m.sent}
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)} aria-label={`${m.ask}: ${name}`}>
        {m.ask}
      </Button>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <input type="hidden" name="myItemId" value={myItemId} />
      <input type="hidden" name="theirItemId" value={theirItemId} />
      <Label htmlFor={noteId} className="sr-only">
        {m.noteLabel}
      </Label>
      <Textarea
        id={noteId}
        name="note"
        maxLength={MATCH_NOTE_MAX}
        placeholder={m.notePlaceholder}
        defaultValue={state.values?.note}
        autoFocus
      />
      <FormError errorKey={state.error} errors={t.errors} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          <Send aria-hidden />
          {m.send}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {m.cancel}
        </Button>
      </div>
    </form>
  );
}
