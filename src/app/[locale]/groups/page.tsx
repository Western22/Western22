import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/groups">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: (await getMessages(locale)).groups.myGroups } : {};
}

/** The caller's groups, with unread messages, story prompts and join requests. */
export default async function GroupsPage({ params }: PageProps<"/[locale]/groups">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getMessages(locale);
  return (
    <div className="flex flex-col gap-5 pb-10">
      <h1 className="text-2xl font-bold tracking-tight">{t.groups.myGroups}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t.common.loading}</p>}>
        <MyGroups locale={locale} t={t} />
      </Suspense>
    </div>
  );
}

async function MyGroups({ locale, t }: { locale: Locale; t: Messages }) {
  await requireOnboardedProfile(locale);
  const supabase = await createClient();
  const { data: groups, error } = await supabase.rpc("my_groups", { p_locale: locale });
  if (error) throw new Error("Could not load groups");
  const g = t.groups;

  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center">
        {g.myGroupsEmpty}{" "}
        <Link href={`/${locale}/explore`} className="text-primary font-medium hover:underline">
          {t.nav.explore}
        </Link>
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {groups.map((group) => (
        <li key={group.id}>
          <Link href={`/${locale}/groups/${group.id}`} className="bg-card flex flex-col gap-1 rounded-2xl border p-4 transition-shadow hover:shadow-md">
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold">{group.name}</span>
              <span className="bg-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">{g.status[group.status]}</span>
            </span>
            <span className="text-muted-foreground text-sm">
              {group.goal_title} · {format(g.members, { count: group.member_count, max: group.max_size })}
            </span>
            {(group.unread_count > 0 || group.story_prompt || group.pending_requests > 0) && (
              <span className="flex flex-wrap gap-1.5 pt-1">
                {group.unread_count > 0 && (
                  <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                    {format(g.unread, { count: group.unread_count })}
                  </span>
                )}
                {group.story_prompt && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{g.storyDue}</span>
                )}
                {group.pending_requests > 0 && (
                  <span className="bg-accent rounded-full px-2 py-0.5 text-xs font-medium">
                    {format(g.requestsDue, { count: group.pending_requests })}
                  </span>
                )}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
