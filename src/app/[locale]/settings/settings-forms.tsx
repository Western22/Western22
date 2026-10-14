"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-message";
import { deleteAccount, updatePrivacy } from "@/lib/actions/safety";
import type { FormState } from "@/lib/validation";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/en";

type T = { settings: Messages["settings"]; errors: Messages["errors"] };

export function PrivacyForm({
  hideFromMatching,
  approximate,
  t,
}: {
  hideFromMatching: boolean;
  approximate: boolean;
  t: T;
}) {
  const p = t.settings.privacy;
  const [state, action, pending] = useActionState<FormState, FormData>(updatePrivacy, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="hideFromMatching" defaultChecked={hideFromMatching} className="accent-primary mt-1 size-4" />
        <span className="flex flex-col">
          <span className="font-medium">{p.hideFromMatching}</span>
          <span className="text-muted-foreground text-sm">{p.hideFromMatchingHelp}</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="approximateLocation" defaultChecked={approximate} className="accent-primary mt-1 size-4" />
        <span className="flex flex-col">
          <span className="font-medium">{p.approximate}</span>
          <span className="text-muted-foreground text-sm">{p.approximateHelp}</span>
          {approximate && <span className="text-muted-foreground text-sm">{p.approximateRefresh}</span>}
        </span>
      </label>
      <FormError errorKey={state.error} errors={t.errors} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {p.save}
        </Button>
        {state.ok && (
          <p role="status" className="text-sm">
            {p.saved}
          </p>
        )}
      </div>
    </form>
  );
}

/** Type your username (or DELETE) to delete the account. */
export function DeleteAccountForm({ confirmWord, locale, t }: { confirmWord: string; locale: string; t: T }) {
  const d = t.settings.data;
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <Label htmlFor="delete-confirm">{format(d.confirm, { word: confirmWord })}</Label>
      <Input id="delete-confirm" name="confirm" required autoComplete="off" autoCapitalize="none" className="max-w-xs" />
      <FormError errorKey={state.error} errors={t.errors} />
      <Button type="submit" variant="destructive" size="sm" className="self-start" disabled={pending}>
        {d.deleteButton}
      </Button>
    </form>
  );
}
