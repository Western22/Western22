"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addGoalToList } from "@/lib/actions/items";
import type { ErrorKey, Messages } from "@/i18n/messages/en";

/** One tap to add this goal; the page refreshes into its "On your list" state. */
export function AddGoalButton({
  goalId,
  title,
  locale,
  t,
}: {
  goalId: string;
  title: string;
  locale: string;
  t: { label: string; errors: Messages["errors"] };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorKey | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addGoalToList(goalId, title, locale);
            if (result.error) setError(result.error);
          })
        }
      >
        <Plus aria-hidden />
        {t.label}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {t.errors[error]}
        </p>
      )}
    </div>
  );
}
