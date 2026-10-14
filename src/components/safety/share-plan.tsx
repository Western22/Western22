"use client";

import { useActionState, useState, useTransition } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FormError } from "@/components/form-message";
import { createPlanShare, revokePlanShare } from "@/lib/actions/safety";
import type { FormState } from "@/lib/validation";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";

type Share = { id: string; contact_name: string; expires_at: string };
type ShareState = FormState & { shareId?: string };

/**
 * "Share my plan with someone I trust": creates a private, expiring link to
 * a read-only summary of the group's plan, then offers copy / text / email.
 * Nothing about the contact is stored except the name typed here.
 */
export function SharePlan({
  groupId,
  groupName,
  shares,
  locale,
  t,
}: {
  groupId: string;
  groupName: string;
  shares: Share[];
  locale: Locale;
  t: { safety: Messages["safety"]; errors: Messages["errors"] };
}) {
  const s = t.safety.share;
  const [state, action, pending] = useActionState<ShareState, FormData>(createPlanShare, {});
  const [copied, setCopied] = useState(false);
  const [revoking, startRevoke] = useTransition();
  const url = state.shareId && typeof window !== "undefined" ? `${window.location.origin}/${locale}/share/${state.shareId}` : null;
  const message = url ? format(s.message, { group: groupName, url }, locale) : "";

  return (
    <section aria-labelledby="share-plan-title" className="flex flex-col gap-3">
      <h2 id="share-plan-title" className="flex items-center gap-2 font-semibold">
        <Link2 className="size-4" aria-hidden />
        {s.title}
      </h2>
      <p className="text-muted-foreground text-sm">{s.body}</p>
      <form action={action} className="flex flex-wrap items-end gap-2" key={state.shareId ?? "new"}>
        <input type="hidden" name="groupId" value={groupId} />
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <Label htmlFor="share-contact">{s.contact}</Label>
          <Input id="share-contact" name="contactName" required maxLength={60} placeholder={s.contactPlaceholder} defaultValue={state.values?.contactName} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="share-days">{s.days}</Label>
          <NativeSelect id="share-days" name="days" defaultValue="14">
            {(["3", "7", "14", "30"] as const).map((d) => (
              <option key={d} value={d}>
                {s.dayOptions[d]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {s.create}
        </Button>
      </form>
      <FormError errorKey={state.error} errors={t.errors} />
      {url && (
        <div role="status" className="bg-muted/50 flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p className="font-medium">{format(s.ready, { name: shares.find((x) => x.id === state.shareId)?.contact_name ?? "" }, locale)}</p>
          <Input readOnly value={url} aria-label={s.copy} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => setCopied(true));
              }}
            >
              {copied ? s.copied : s.copy}
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`sms:?&body=${encodeURIComponent(message)}`}>{s.text}</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`mailto:?subject=${encodeURIComponent(s.subject)}&body=${encodeURIComponent(message)}`}>{s.email}</a>
            </Button>
          </div>
        </div>
      )}
      {shares.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <h3 className="font-medium">{s.active}</h3>
          <ul className="flex flex-col gap-1">
            {shares.map((share) => (
              <li key={share.id} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {format(s.expires, {
                    name: share.contact_name,
                    date: new Date(share.expires_at).toLocaleDateString(locale, { dateStyle: "medium" }),
                  }, locale)}
                </span>
                <Button type="button" size="sm" variant="ghost" disabled={revoking} onClick={() => startRevoke(() => revokePlanShare(share.id))}>
                  {s.revoke}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
