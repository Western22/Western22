"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addGoalFromStory } from "@/lib/actions/social";
import type { ErrorKey, Messages } from "@/i18n/messages/en";

/** "Add to my bucket list" on a story: the main way stories inspire new goals. */
export function AddFromStoryButton({
  storyId,
  onList,
  t,
}: {
  storyId: string;
  onList: boolean;
  t: { stories: Messages["stories"]; errors: Messages["errors"] };
}) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<ErrorKey | undefined>();

  if (onList || added) {
    return (
      <span className="text-primary flex items-center gap-1 text-sm font-medium">
        <Check className="size-4" aria-hidden />
        {t.stories.onList}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addGoalFromStory(storyId);
            if (result.ok || result.error === "alreadyOnList") setAdded(true);
            else setError(result.error);
          })
        }
      >
        <Plus aria-hidden />
        {t.stories.addToList}
      </Button>
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {t.errors[error]}
        </span>
      )}
    </span>
  );
}
