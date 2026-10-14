"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-message";
import { unsubscribe } from "@/lib/actions/notifications";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

export function UnsubscribeForm({
  token,
  type,
  question,
  t,
  settingsHref,
}: {
  token: string;
  type: string;
  question: string;
  t: { button: string; done: string; manage: string; errors: Messages["errors"] };
  settingsHref: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(unsubscribe, {});
  if (state.ok) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status">{t.done}</p>
        <Link href={settingsHref} className="text-sm underline">
          {t.manage}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="type" value={type} />
      <p className="text-pretty">{question}</p>
      <FormError errorKey={state.error} errors={t.errors} />
      <Button type="submit" disabled={pending}>
        {t.button}
      </Button>
    </form>
  );
}
