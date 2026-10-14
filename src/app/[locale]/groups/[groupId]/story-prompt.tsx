import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissStoryPrompt } from "@/lib/actions/groups";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import type { GroupContext } from "./page";

/** Shown to each member after the group completes its goal, until they post a story or dismiss it. */
export function StoryPrompt({ ctx, locale, t }: { ctx: GroupContext; locale: Locale; t: Messages }) {
  const g = t.groups;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <p className="flex items-start gap-2 text-sm font-medium">
        <PartyPopper className="mt-0.5 size-4 shrink-0" aria-hidden />
        {format(g.storyPrompt, { goal: ctx.goalTitle })}
      </p>
      <div className="flex gap-2">
        <Button asChild size="sm">
          <Link href={`/${locale}/groups/${ctx.id}?tab=memories`}>{g.writeStory}</Link>
        </Button>
        <form action={dismissStoryPrompt.bind(null, ctx.id)}>
          <Button type="submit" size="sm" variant="ghost">
            {g.notNow}
          </Button>
        </form>
      </div>
    </div>
  );
}
