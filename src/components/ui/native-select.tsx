import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A styled native <select>. Works without JavaScript and is accessible on
 * mobile out of the box. Swap for shadcn's Radix Select if we need custom UI.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
