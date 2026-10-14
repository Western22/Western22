"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FormError } from "@/components/form-message";
import { saveRegionSettings } from "@/lib/actions/region";
import type { FormState } from "@/lib/validation";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/en";

type T = { region: Messages["settings"]["region"]; errors: Messages["errors"] };

/** "Euro" for EUR in the reader's language; the code if the browser doesn't know it. */
function currencyName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function languageName(code: string): string {
  // Each language in its own name ("Español"), so people can find theirs.
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

/**
 * Language, currency and units. "Automatic" picks currency and units from
 * the home country on the profile (shown in brackets).
 */
export function RegionSettingsForm({
  locale,
  languages,
  currencies,
  currency,
  units,
  auto,
  t,
}: {
  locale: string;
  languages: readonly string[];
  /** Currencies we have exchange rates for (plus USD). */
  currencies: string[];
  currency: string | null;
  units: "metric" | "imperial" | null;
  /** What "Automatic" currently resolves to. */
  auto: { currency: string; units: "metric" | "imperial" };
  t: T;
}) {
  const r = t.region;
  const [state, action, pending] = useActionState<FormState, FormData>(saveRegionSettings, {});
  const sortedCurrencies = [...currencies].sort((a, b) => currencyName(a, locale).localeCompare(currencyName(b, locale), locale));

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="currentLocale" value={locale} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="region-language">{r.language}</Label>
          <NativeSelect id="region-language" name="language" defaultValue={locale}>
            {languages.map((l) => (
              <option key={l} value={l}>
                {languageName(l)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="region-currency">{r.currency}</Label>
          <NativeSelect id="region-currency" name="currency" defaultValue={currency ?? ""}>
            <option value="">{format(r.automatic, { value: auto.currency }, locale)}</option>
            {sortedCurrencies.map((c) => (
              <option key={c} value={c}>
                {currencyName(c, locale)} ({c})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="region-units">{r.units}</Label>
          <NativeSelect id="region-units" name="units" defaultValue={units ?? ""}>
            <option value="">{format(r.automatic, { value: r[auto.units] }, locale)}</option>
            <option value="metric">{r.metric}</option>
            <option value="imperial">{r.imperial}</option>
          </NativeSelect>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{r.help}</p>
      <FormError errorKey={state.error} errors={t.errors} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {r.save}
        </Button>
        {state.ok && (
          <p role="status" className="text-sm">
            {r.saved}
          </p>
        )}
      </div>
    </form>
  );
}
