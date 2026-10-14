"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FormError } from "@/components/form-message";
import { saveNotificationSettings } from "@/lib/actions/notifications";
import type { NotificationChannel, NotificationType } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import type { Messages } from "@/i18n/messages/en";

type Pref = { type: NotificationType; in_app: boolean; email: boolean; push: boolean };
const CHANNELS: NotificationChannel[] = ["in_app", "email", "push"];
const noSubscribe = () => () => {};

/**
 * Per-type switches for in-app, email and push, quiet hours, time zone and
 * "pause all email". The weekly digest is email-only, so its other boxes are
 * not shown.
 */
export function NotificationSettingsForm({
  prefs,
  timezone,
  quietStart,
  quietEnd,
  emailPaused,
  t,
}: {
  prefs: Pref[];
  timezone: string | null;
  quietStart: string | null;
  quietEnd: string | null;
  emailPaused: boolean;
  t: { ns: Messages["notifications"]["settings"]; errors: Messages["errors"] };
}) {
  const ns = t.ns;
  const [state, action, pending] = useActionState<FormState, FormData>(saveNotificationSettings, {});
  const [quietOn, setQuietOn] = useState(Boolean(quietStart));
  // Until we know theirs, suggest the browser's own time zone (null while rendering on the server).
  const browserTz = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    () => null,
  );
  const [chosenTz, setTz] = useState<string | null>(null);
  const tz = chosenTz ?? timezone ?? browserTz ?? "UTC";
  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return Array.from(new Set(["UTC", tz, ...all]));
  }, [tz]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="py-1 text-left font-normal">
              <span className="sr-only">{ns.title}</span>
            </th>
            {CHANNELS.map((c) => (
              <th key={c} scope="col" className="w-14 py-1 text-center font-normal">
                {ns.channels[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {prefs.map((p) => (
            <tr key={p.type}>
              <th scope="row" className="py-2 pr-2 text-left font-normal text-pretty">
                {ns.types[p.type]}
              </th>
              {CHANNELS.map((c) => (
                <td key={c} className="py-2 text-center">
                  {p.type === "weekly_digest" && c !== "email" ? (
                    <span aria-hidden className="text-muted-foreground">
                      –
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      name={`${p.type}:${c}`}
                      defaultChecked={p[c]}
                      aria-label={`${ns.types[p.type]}: ${ns.channels[c]}`}
                      className="size-4 accent-current"
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{ns.quietHours}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="quietOn" checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} className="size-4" />
          {ns.quietHours}
        </label>
        {quietOn && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Label htmlFor="quiet-start">{ns.quietFrom}</Label>
            <input id="quiet-start" name="quietStart" type="time" required defaultValue={quietStart?.slice(0, 5) ?? "22:00"} className="rounded-md border px-2 py-1" />
            <Label htmlFor="quiet-end">{ns.quietTo}</Label>
            <input id="quiet-end" name="quietEnd" type="time" required defaultValue={quietEnd?.slice(0, 5) ?? "07:00"} className="rounded-md border px-2 py-1" />
          </div>
        )}
        <p className="text-muted-foreground text-xs">{ns.quietHelp}</p>
      </fieldset>

      <div className="flex flex-col gap-1">
        <Label htmlFor="timezone">{ns.timezone}</Label>
        <NativeSelect id="timezone" name="timezone" value={tz} onChange={(e) => setTz(e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </NativeSelect>
        <p className="text-muted-foreground text-xs">{ns.timezoneHelp}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="emailPaused" defaultChecked={emailPaused} className="size-4" />
        {ns.pauseEmail}
      </label>

      <FormError errorKey={state.error} errors={t.errors} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {ns.save}
        </Button>
        {state.ok && (
          <p role="status" className="text-sm">
            {ns.saved}
          </p>
        )}
      </div>
    </form>
  );
}
