"use client";

import { useTransition } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { blockUser, unblockUser } from "@/lib/actions/matching";

/** Block or unblock someone from their profile. Blocking asks for confirmation first. */
export function BlockButton({
  userId,
  blocked,
  t,
}: {
  userId: string;
  blocked: boolean;
  t: { block: string; unblock: string; confirm: string };
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!blocked && !window.confirm(t.confirm)) return;
    startTransition(async () => {
      await (blocked ? unblockUser(userId) : blockUser(userId));
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} disabled={pending} className="text-muted-foreground">
      <Ban aria-hidden />
      {blocked ? t.unblock : t.block}
    </Button>
  );
}
