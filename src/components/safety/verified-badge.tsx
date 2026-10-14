import { BadgeCheck } from "lucide-react";
import type { Messages } from "@/i18n/messages/en";

/** The verification tier as a small badge: ID beats phone; nothing when unverified. */
export function VerifiedBadge({
  profile,
  t,
}: {
  profile: { phone_verified_at: string | null; id_verified_at: string | null };
  t: Messages["verification"];
}) {
  const label = profile.id_verified_at ? t.idBadge : profile.phone_verified_at ? t.phoneBadge : null;
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
      <BadgeCheck className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
