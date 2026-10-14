"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props<T extends string> = {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
  label: (option: T) => string;
  /** When set, each selected value is also submitted as a hidden form input. */
  name?: string;
  max?: number;
  /** Accessible name for the group. */
  groupLabel: string;
  size?: "sm" | "lg";
};

/** Multi-select toggle chips. Large, thumb-friendly, and keyboard accessible. */
export function ChipPicker<T extends string>({ options, selected, onChange, label, name, max, groupLabel, size = "sm" }: Props<T>) {
  const atMax = max !== undefined && selected.length >= max;

  return (
    <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            disabled={!on && atMax}
            onClick={() => onChange(on ? selected.filter((s) => s !== option) : [...selected, option])}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border transition-all duration-150 active:scale-95 disabled:opacity-40",
              "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
              size === "lg" ? "px-4 py-2 text-base" : "px-3 py-1.5 text-sm",
              on
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background hover:border-primary/60 hover:bg-accent",
            )}
          >
            {on && <Check className="size-3.5" aria-hidden />}
            {label(option)}
          </button>
        );
      })}
      {name && selected.map((value) => <input key={value} type="hidden" name={name} value={value} />)}
    </div>
  );
}
