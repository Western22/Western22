"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { cancelJoinRequest, joinGroup } from "@/lib/actions/groups";
import type { GroupJoinPolicy } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

/** Join an open group, or ask to join (with an optional note) / cancel the ask. */
export function JoinGroupButton({
  groupId,
  policy,
  requestPending,
  locale,
  t,
}: {
  groupId: string;
  policy: GroupJoinPolicy;
  requestPending: boolean;
  locale: string;
  t: { groups: Messages["groups"]; errors: Messages["errors"] };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinGroup, {});
  const [open, setOpen] = useState(false);
  const [cancelling, startCancel] = useTransition();
  const g = t.groups;

  if (requestPending || state.ok) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-sm">{g.requested}</span>
        <Button type="button" size="sm" variant="ghost" disabled={cancelling} onClick={() => startCancel(async () => void (await cancelJoinRequest(groupId)))}>
          {g.cancelRequest}
        </Button>
      </div>
    );
  }

  if (policy === "request" && !open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        {g.askToJoin}
      </Button>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="locale" value={locale} />
      {policy === "request" && (
        <Textarea name="note" maxLength={280} placeholder={g.notePlaceholder} aria-label={g.notePlaceholder} autoFocus />
      )}
      <FormError errorKey={state.error} errors={t.errors} />
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {policy === "request" ? g.askToJoin : g.join}
        </Button>
      </div>
    </form>
  );
}
