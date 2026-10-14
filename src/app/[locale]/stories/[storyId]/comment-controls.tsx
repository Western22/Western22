"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-message";
import { addComment, deleteComment, untagMe } from "@/lib/actions/social";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

export function CommentForm({ storyId, t }: { storyId: string; t: { stories: Messages["stories"]; errors: Messages["errors"] } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addComment, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="storyId" value={storyId} />
      <Textarea
        name="body"
        required
        maxLength={500}
        placeholder={t.stories.commentPlaceholder}
        aria-label={t.stories.commentPlaceholder}
        defaultValue={state.ok ? "" : state.values?.body}
        key={state.ok ? "sent" : "draft"}
      />
      <FormError errorKey={state.error} errors={t.errors} />
      <Button type="submit" size="sm" className="self-start" disabled={pending}>
        {t.stories.comment}
      </Button>
    </form>
  );
}

export function DeleteCommentButton({ commentId, label }: { commentId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() => startTransition(() => deleteComment(commentId))}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}

export function UntagButton({ storyId, label }: { storyId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(() => untagMe(storyId))}>
      {label}
    </Button>
  );
}
