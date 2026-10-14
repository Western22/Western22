import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  BUCKET_BUDGETS,
  BUCKET_FLEXIBILITIES,
  BUCKET_TIMEFRAMES,
  BUCKET_VISIBILITIES,
  type BucketBudget,
  type BucketFlexibility,
  type BucketTimeframe,
  type BucketVisibility,
} from "@/lib/supabase/database.types";
import type { Messages } from "@/i18n/messages/en";

type Defaults = {
  timeframe: BucketTimeframe;
  flexibility: BucketFlexibility;
  budget: BucketBudget | null;
  visibility: BucketVisibility;
};

/**
 * The item detail selects shared by the add form and each item's edit form.
 * `idPrefix` keeps label/field ids unique when several forms are on a page.
 */
export function ItemFields({ idPrefix, defaults, t }: { idPrefix: string; defaults: Defaults; t: Messages["items"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id={`${idPrefix}-timeframe`} label={t.fieldTimeframe}>
        <NativeSelect id={`${idPrefix}-timeframe`} name="timeframe" defaultValue={defaults.timeframe}>
          {BUCKET_TIMEFRAMES.map((v) => (
            <option key={v} value={v}>
              {t.timeframe[v]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-flexibility`} label={t.fieldFlexibility}>
        <NativeSelect id={`${idPrefix}-flexibility`} name="flexibility" defaultValue={defaults.flexibility}>
          {BUCKET_FLEXIBILITIES.map((v) => (
            <option key={v} value={v}>
              {t.flexibility[v]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-budget`} label={t.fieldBudget}>
        <NativeSelect id={`${idPrefix}-budget`} name="budget" defaultValue={defaults.budget ?? ""}>
          <option value="">{t.budgetNone}</option>
          {BUCKET_BUDGETS.map((v) => (
            <option key={v} value={v}>
              {t.budget[v]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id={`${idPrefix}-visibility`} label={t.fieldVisibility}>
        <NativeSelect
          id={`${idPrefix}-visibility`}
          name="visibility"
          defaultValue={defaults.visibility}
          aria-describedby={`${idPrefix}-visibility-hint`}
        >
          {BUCKET_VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {t.visibility[v]}
            </option>
          ))}
        </NativeSelect>
        <p id={`${idPrefix}-visibility-hint`} className="text-muted-foreground text-xs">
          {t.visibilityHint}
        </p>
      </Field>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
