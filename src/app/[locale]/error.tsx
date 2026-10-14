"use client";

import { Button } from "@/components/ui/button";

// TODO(i18n): error boundaries are client components without the messages; pass them via context.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p>Something went wrong. Please try again.</p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
