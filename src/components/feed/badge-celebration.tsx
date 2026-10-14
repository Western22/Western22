"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markBadgesSeen } from "@/lib/actions/social";

/** A one-time "New badge" note; dismissing it records the badges as seen. */
export function BadgeCelebration({
  title,
  badges,
  cta,
}: {
  title: string;
  badges: { emoji: string; name: string; description: string }[];
  cta: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <section role="status" className="from-primary/15 to-accent flex flex-col gap-3 rounded-2xl bg-gradient-to-br p-4">
      <h2 className="font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">
        {badges.map((b) => (
          <li key={b.name} className="flex items-center gap-3">
            <span aria-hidden className="text-2xl">
              {b.emoji}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{b.name}</span>
              <span className="text-muted-foreground text-xs">{b.description}</span>
            </span>
          </li>
        ))}
      </ul>
      <Button type="button" size="sm" className="self-start" disabled={pending} onClick={() => startTransition(() => markBadgesSeen())}>
        {cta}
      </Button>
    </section>
  );
}
