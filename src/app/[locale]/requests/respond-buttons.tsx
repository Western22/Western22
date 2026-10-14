"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { respondMatchRequest } from "@/lib/actions/matching";
import type { ErrorKey, Messages } from "@/i18n/messages/en";

/** Accept or decline a request sent to you. */
export function RespondButtons({
  requestId,
  name,
  t,
}: {
  requestId: string;
  name: string;
  t: { accept: string; decline: string; errors: Messages["errors"] };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorKey | undefined>();

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = await respondMatchRequest(requestId, accept);
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => respond(true)} aria-label={`${t.accept}: ${name}`}>
          <Check aria-hidden />
          {t.accept}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => respond(false)} aria-label={`${t.decline}: ${name}`}>
          <X aria-hidden />
          {t.decline}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t.errors[error]}
        </p>
      )}
    </div>
  );
}
