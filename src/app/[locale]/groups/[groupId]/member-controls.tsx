"use client";

import { useLocale } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import { Check, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { leaveGroup, removeGroupMember, respondJoinRequest, updateGroup } from "@/lib/actions/groups";
import type { GroupJoinPolicy } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { ErrorKey, Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";

type T = { members: Messages["groups"]["membersTab"]; groups: Messages["groups"]; errors: Messages["errors"] };

export function JoinRequestButtons({ requestId, name, t }: { requestId: string; name: string; t: T }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorKey | undefined>();
  const respond = (accept: boolean) => startTransition(async () => setError((await respondJoinRequest(requestId, accept)).error));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => respond(true)} aria-label={`${t.members.accept}: ${name}`}>
          <Check aria-hidden />
          {t.members.accept}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => respond(false)} aria-label={`${t.members.decline}: ${name}`}>
          <X aria-hidden />
          {t.members.decline}
        </Button>
      </div>
      <FormError errorKey={error} errors={t.errors} />
    </div>
  );
}

export function RemoveMemberButton({ groupId, userId, name, t }: { groupId: string; userId: string; name: string; t: T }) {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`${t.members.remove}: ${name}`}
      onClick={() => {
        if (!window.confirm(format(t.members.removeConfirm, { name }, locale))) return;
        startTransition(async () => void (await removeGroupMember(groupId, userId)));
      }}
    >
      {t.members.remove}
    </Button>
  );
}

export function LeaveButton({ groupId, locale, t }: { groupId: string; locale: string; t: T }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.members.leaveConfirm)) return;
        startTransition(async () => void (await leaveGroup(groupId, locale)));
      }}
    >
      <LogOut aria-hidden />
      {t.members.leave}
    </Button>
  );
}

export function GroupSettingsForm({
  groupId,
  defaults,
  minSize,
  t,
}: {
  groupId: string;
  defaults: { name: string; description: string; maxSize: number; joinPolicy: GroupJoinPolicy };
  minSize: number;
  t: T;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateGroup, {});
  const g = t.groups;
  const sizes = Array.from({ length: 20 - minSize + 1 }, (_, i) => i + minSize);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <FormError errorKey={state.error} errors={t.errors} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-name">{g.name}</Label>
        <Input id="settings-name" name="name" required maxLength={80} defaultValue={defaults.name} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-description">{g.description}</Label>
        <Textarea id="settings-description" name="description" maxLength={500} defaultValue={defaults.description} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-size">{g.maxSize}</Label>
          <NativeSelect id="settings-size" name="maxSize" defaultValue={String(Math.max(defaults.maxSize, minSize))}>
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-policy">{g.joinPolicy}</Label>
          <NativeSelect id="settings-policy" name="joinPolicy" defaultValue={defaults.joinPolicy}>
            <option value="open">{g.policy.open}</option>
            <option value="request">{g.policy.request}</option>
          </NativeSelect>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {t.members.save}
        </Button>
        {state.ok && (
          <p role="status" className="text-muted-foreground text-sm">
            {g.plan.saved}
          </p>
        )}
      </div>
    </form>
  );
}
