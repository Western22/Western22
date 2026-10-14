"use client";

import { useOptimistic, useTransition } from "react";
import { UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { follow, unfollow } from "@/lib/actions/social";

/** Follow / unfollow. Following someone puts their stories in your feed. */
export function FollowButton({
  userId,
  following,
  t,
}: {
  userId: string;
  following: boolean;
  t: { follow: string; following: string; unfollow: string };
}) {
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useOptimistic(following);
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "outline" : "default"}
      aria-pressed={on}
      disabled={pending}
      title={on ? t.unfollow : undefined}
      onClick={() =>
        startTransition(async () => {
          setOn(!on);
          await (on ? unfollow(userId) : follow(userId));
        })
      }
    >
      {on ? <UserCheck aria-hidden /> : <UserPlus aria-hidden />}
      {on ? t.following : t.follow}
    </Button>
  );
}
