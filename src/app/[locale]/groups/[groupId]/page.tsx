import type { Metadata } from "next";
import { ReportButton } from "@/components/safety/report-button";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import type { Messages } from "@/i18n/messages/en";
import { format } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { JoinGroupButton } from "@/components/groups/join-group-button";
import { ChatTab } from "./chat-tab";
import { PlanTab } from "./plan-tab";
import { MembersTab } from "./members-tab";
import { MemoriesTab } from "./memories-tab";
import { StoryPrompt } from "./story-prompt";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS = ["chat", "plan", "members", "memories"] as const;
export type GroupTab = (typeof TABS)[number];

export type GroupContext = {
  id: string;
  goalId: string;
  goalSlug: string;
  goalTitle: string;
  name: string;
  description: string | null;
  status: "forming" | "planning" | "confirmed" | "completed";
  maxSize: number;
  memberCount: number;
  joinPolicy: "open" | "request";
  isOwner: boolean;
  me: string;
};

export async function generateMetadata({ params }: PageProps<"/[locale]/groups/[groupId]">): Promise<Metadata> {
  const { groupId } = await params;
  if (!UUID_RE.test(groupId)) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("groups").select("name").eq("id", groupId).maybeSingle();
  return data ? { title: data.name } : {};
}

/** The group space: Chat, Plan, Members and Memories, for members only. */
export default function GroupPage({ params, searchParams }: PageProps<"/[locale]/groups/[groupId]">) {
  return (
    <Suspense fallback={<div aria-hidden className="bg-muted/60 h-64 animate-pulse rounded-3xl" />}>
      <Group params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Group({
  params,
  searchParams,
}: {
  params: PageProps<"/[locale]/groups/[groupId]">["params"];
  searchParams: PageProps<"/[locale]/groups/[groupId]">["searchParams"];
}) {
  const { locale, groupId } = await params;
  if (!isLocale(locale) || !UUID_RE.test(groupId)) notFound();
  const t = await getMessages(locale);
  const user = await requireOnboardedProfile(locale);
  const sp = await searchParams;
  const tab: GroupTab = TABS.find((x) => x === sp.tab) ?? "chat";

  const supabase = await createClient();
  const [{ data: group }, { data: membership }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, goal_id, name, description, status, max_size, member_count, join_policy, owner_id, goal:goals(slug)")
      .eq("id", groupId)
      .maybeSingle(),
    supabase.from("group_members").select("role, story_prompt").eq("group_id", groupId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!group) notFound();
  const { data: goalTitle } = await supabase.rpc("goal_title", { p_goal_id: group.goal_id, p_locale: locale });

  const ctx: GroupContext = {
    id: group.id,
    goalId: group.goal_id,
    goalSlug: group.goal?.slug ?? "",
    goalTitle: goalTitle ?? "",
    name: group.name,
    description: group.description,
    status: group.status,
    maxSize: group.max_size,
    memberCount: group.member_count,
    joinPolicy: group.join_policy,
    isOwner: membership?.role === "owner",
    me: user.id,
  };
  const g = t.groups;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <Link
        href={`/${locale}/groups`}
        className="text-muted-foreground flex items-center gap-1 self-start text-sm underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {g.myGroups}
      </Link>
      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-balance">{group.name}</h1>
          <span className="bg-primary/10 text-primary mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {g.status[group.status]}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          <Link href={`/${locale}/goals/${ctx.goalSlug}`} className="hover:underline">
            {ctx.goalTitle}
          </Link>{" "}
          · {format(g.members, { count: group.member_count, max: group.max_size }, locale)}
        </p>
        {group.description && <p className="text-sm text-pretty">{group.description}</p>}
        {!ctx.isOwner && (
          <ReportButton targetType="group" targetId={group.id} t={{ report: t.report, errors: t.errors }} />
        )}
      </header>

      {!membership ? (
        <NotMember ctx={ctx} locale={locale} t={t} />
      ) : (
        <>
          {membership.story_prompt && <StoryPrompt ctx={ctx} locale={locale} t={t} />}
          <nav aria-label={group.name} className="flex gap-1 rounded-full border p-1">
            {TABS.map((x) => (
              <Link
                key={x}
                href={`/${locale}/groups/${group.id}${x === "chat" ? "" : `?tab=${x}`}`}
                aria-current={tab === x ? "page" : undefined}
                className={cn(
                  "flex-1 rounded-full px-2 py-1.5 text-center text-sm font-medium transition-colors",
                  tab === x ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {g.tabs[x]}
              </Link>
            ))}
          </nav>
          {tab === "chat" && <ChatTab ctx={ctx} locale={locale} t={t} />}
          {tab === "plan" && <PlanTab ctx={ctx} locale={locale} t={t} />}
          {tab === "members" && <MembersTab ctx={ctx} locale={locale} t={t} />}
          {tab === "memories" && <MemoriesTab ctx={ctx} locale={locale} t={t} />}
        </>
      )}
    </div>
  );
}

/** Someone who isn't in the group sees the summary and a way in. */
async function NotMember({ ctx, locale, t }: { ctx: GroupContext; locale: Locale; t: Messages }) {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("group_join_requests")
    .select("id")
    .eq("group_id", ctx.id)
    .eq("user_id", ctx.me)
    .eq("status", "pending")
    .maybeSingle();
  const g = t.groups;
  if (ctx.status === "completed") return <p className="text-muted-foreground">{t.errors.groupClosed}</p>;
  if (ctx.memberCount >= ctx.maxSize && !pending) return <p className="text-muted-foreground">{g.full}</p>;
  return (
    <JoinGroupButton
      groupId={ctx.id}
      policy={ctx.joinPolicy}
      requestPending={Boolean(pending)}
      locale={locale}
      t={{ groups: g, errors: t.errors }}
    />
  );
}
