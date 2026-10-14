"use client";

import { useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchGoals } from "@/lib/actions/onboarding";
import type { GoalSuggestion } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Props = {
  locale: string;
  value: string;
  onChange: (text: string) => void;
  /** Called when the user picks a suggested goal. */
  onSelect: (goal: GoalSuggestion) => void;
  placeholder: string;
  /** Rendered under each suggestion, e.g. "12 want this". */
  wantedLabel: (count: number) => string;
  name?: string;
  id?: string;
  autoFocus?: boolean;
  /** Extra row at the end of the list (e.g. "Add 'my own idea'"). */
  footer?: React.ReactNode;
};

/**
 * Text input with goal suggestions from search_goals(). Matching runs on
 * aliases in every language, so "aurora boreal" finds "See the Northern Lights".
 */
export function GoalSearch({ locale, value, onChange, onSelect, placeholder, wantedLabel, name, id, autoFocus, footer }: Props) {
  const listId = useId();
  const [results, setResults] = useState<GoalSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  // Debounced search; ignores responses that arrive after the text changed.
  useEffect(() => {
    const query = value.trim();
    // Short queries just hide the list (see showList); no request needed.
    if (query.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchGoals(query, locale)
        .then((rows) => !cancelled && setResults(rows))
        .catch(() => !cancelled && setResults([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, locale]);

  const showList = open && value.trim().length >= 2 && (results.length > 0 || footer);

  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" aria-hidden />
      <Input
        id={id}
        name={name}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        maxLength={140}
        placeholder={placeholder}
        className="h-11 ps-9 text-base"
        role="combobox"
        aria-expanded={!!showList}
        aria-controls={listId}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="bg-card absolute z-20 mt-1 w-full overflow-hidden rounded-lg border shadow-lg"
        >
          {results.map((goal) => (
            <li key={goal.goal_id} role="option" aria-selected={false}>
              <button
                type="button"
                className={cn("hover:bg-accent flex w-full flex-col items-start px-3 py-2 text-start")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(goal);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{goal.title}</span>
                {goal.wanted_count > 0 && (
                  <span className="text-muted-foreground text-xs">{wantedLabel(goal.wanted_count)}</span>
                )}
              </button>
            </li>
          ))}
          {footer && <li className="border-t">{footer}</li>}
        </ul>
      )}
    </div>
  );
}
