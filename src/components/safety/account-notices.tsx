import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { AcknowledgeWarningButton } from "./acknowledge-warning-button";

/**
 * A banner under the header for a suspension or an unread moderator warning.
 * Only the signed-in person sees their own notices (my_account_notices).
 */
export async function AccountNotices({ locale, t }: { locale: Locale; t: Messages }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_account_notices");
  if (!data || data.length === 0) return null;
  const n = t.notices;
  const suspension = data.find((d) => d.suspended_until);
  const warnings = data.filter((d) => d.warning_id);
  // 'infinity' comes back as the string "infinity".
  const until = suspension?.suspended_until;
  const forever = until === "infinity" || (until ? new Date(until).getFullYear() > 9000 : false);

  return (
    <div className="mx-auto mt-4 flex w-full max-w-3xl flex-col gap-2 px-4">
      {suspension && (
        <div role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {forever
              ? n.suspendedIndefinitely
              : format(n.suspended, { date: new Date(until!).toLocaleDateString(locale, { dateStyle: "medium" }) })}{" "}
            <Link href={`/${locale}/guidelines`} className="underline">
              {n.guidelines}
            </Link>
          </p>
        </div>
      )}
      {warnings.map((w) => (
        <div key={w.warning_id} role="alert" className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          <p className="flex gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {n.warning} <q>{w.warning}</q>{" "}
              <Link href={`/${locale}/guidelines`} className="underline">
                {n.guidelines}
              </Link>
            </span>
          </p>
          <AcknowledgeWarningButton warningId={w.warning_id!} label={n.gotIt} />
        </div>
      ))}
    </div>
  );
}
