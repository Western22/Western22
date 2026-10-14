"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acknowledgeWarning } from "@/lib/actions/safety";

export function AcknowledgeWarningButton({ warningId, label }: { warningId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="self-start"
      disabled={pending}
      onClick={() => startTransition(() => acknowledgeWarning(warningId))}
    >
      {label}
    </Button>
  );
}
