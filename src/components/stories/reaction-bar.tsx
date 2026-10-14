"use client";

import { useLocale } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { setReaction } from "@/lib/actions/social";
import { REACTION_KINDS, type ReactionKind } from "@/lib/supabase/database.types";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { cn } from "@/lib/utils";

const EMOJI: Record<ReactionKind, string> = { love: "❤️", fire: "🔥", inspired: "🙌", congrats: "👏" };

type State = { counts: Partial<Record<ReactionKind, number>>; mine: ReactionKind[] };

/** Toggle reactions; counts update immediately and the server refresh confirms them. */
export function ReactionBar({
  storyId,
  counts,
  mine,
  canReact,
  t,
}: {
  storyId: string;
  counts: Partial<Record<ReactionKind, number>>;
  mine: ReactionKind[];
  canReact: boolean;
  t: Messages["stories"];
}) {
  const locale = useLocale();
  const [, startTransition] = useTransition();
  const [state, toggle] = useOptimistic<State, ReactionKind>({ counts, mine }, (prev, kind) => {
    const on = !prev.mine.includes(kind);
    return {
      counts: { ...prev.counts, [kind]: Math.max(0, (prev.counts[kind] ?? 0) + (on ? 1 : -1)) },
      mine: on ? [...prev.mine, kind] : prev.mine.filter((k) => k !== kind),
    };
  });

  return (
    <div className="flex flex-wrap gap-1.5">
      {REACTION_KINDS.map((kind) => {
        const count = state.counts[kind] ?? 0;
        const active = state.mine.includes(kind);
        if (!canReact && count === 0) return null;
        return (
          <button
            key={kind}
            type="button"
            disabled={!canReact}
            aria-pressed={active}
            aria-label={format(t.reactionCount, { label: t.reactions[kind], count }, locale)}
            title={t.reactions[kind]}
            onClick={() =>
              startTransition(async () => {
                toggle(kind);
                await setReaction(storyId, kind, !active);
              })
            }
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors disabled:cursor-default",
              active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
            )}
          >
            <span aria-hidden>{EMOJI[kind]}</span>
            {count > 0 && <span className="text-xs font-medium">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
