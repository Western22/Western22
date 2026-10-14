import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import type { GroupContext } from "./page";
import { GroupSettingsForm, JoinRequestButtons, LeaveButton, RemoveMemberButton } from "./member-controls";

/** Members tab: who's in, join requests and settings for the owner, and leaving. */
export async function MembersTab({ ctx, locale, t }: { ctx: GroupContext; locale: Locale; t: Messages }) {
  const supabase = await createClient();
  const [{ data: members }, { data: requests }] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id, role, joined_at, profile:profiles(username, display_name, avatar_url)")
      .eq("group_id", ctx.id)
      .order("joined_at"),
    ctx.isOwner
      ? supabase
          .from("group_join_requests")
          .select("id, note, created_at, profile:profiles(username, display_name, avatar_url)")
          .eq("group_id", ctx.id)
          .eq("status", "pending")
          .order("created_at")
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const m = t.groups.membersTab;
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const tm = { members: m, groups: t.groups, errors: t.errors };

  return (
    <div className="flex flex-col gap-6">
      {ctx.isOwner && (requests ?? []).length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{m.requests}</h2>
          <ul className="flex flex-col gap-2">
            {(requests ?? []).map((r) => {
              const name = r.profile?.display_name || `@${r.profile?.username ?? "?"}`;
              return (
                <li key={r.id} className="bg-card flex flex-col gap-2 rounded-xl border p-3">
                  <p className="text-sm font-medium">
                    {r.profile?.username ? (
                      <Link href={`/${locale}/u/${r.profile.username}`} className="hover:underline">
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                  </p>
                  {r.note && <blockquote className="bg-muted rounded-lg px-3 py-2 text-sm break-words">{r.note}</blockquote>}
                  <JoinRequestButtons requestId={r.id} name={name} t={tm} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {t.groups.tabs.members}{" "}
          <span className="text-muted-foreground font-normal">{format(t.groups.members, { count: ctx.memberCount, max: ctx.maxSize })}</span>
        </h2>
        <ul className="flex flex-col gap-2">
          {(members ?? []).map((member) => {
            const name = member.profile?.display_name || `@${member.profile?.username ?? "?"}`;
            return (
              <li key={member.user_id} className="flex items-center gap-3 rounded-xl border p-3">
                {member.profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user upload from Supabase Storage
                  <img src={member.profile.avatar_url} alt="" className="size-10 rounded-full object-cover" />
                ) : (
                  <div aria-hidden className="bg-muted flex size-10 items-center justify-center rounded-full font-semibold">
                    {name.replace("@", "").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.profile?.username ? (
                      <Link href={`/${locale}/u/${member.profile.username}`} className="hover:underline">
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                    {member.role === "owner" && (
                      <span className="bg-primary/10 text-primary ml-2 rounded-full px-2 py-0.5 text-xs">{m.owner}</span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">{format(m.joinedOn, { date: dateFormat.format(new Date(member.joined_at)) })}</p>
                </div>
                {ctx.isOwner && member.user_id !== ctx.me && (
                  <RemoveMemberButton groupId={ctx.id} userId={member.user_id} name={name} t={tm} />
                )}
              </li>
            );
          })}
        </ul>
        <LeaveButton groupId={ctx.id} locale={locale} t={tm} />
      </section>

      {ctx.isOwner && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{m.settings}</h2>
          <GroupSettingsForm
            groupId={ctx.id}
            defaults={{ name: ctx.name, description: ctx.description ?? "", maxSize: ctx.maxSize, joinPolicy: ctx.joinPolicy }}
            minSize={Math.max(2, ctx.memberCount)}
            t={tm}
          />
        </section>
      )}
    </div>
  );
}
