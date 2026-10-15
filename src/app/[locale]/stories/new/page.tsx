import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/seo";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireOnboardedProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { StoryComposer, type ComposerGroup } from "@/components/stories/story-composer";

const SLUG_RE = /^[a-z0-9-]{3,90}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/[locale]/stories/new">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { ...PRIVATE_PAGE, title: (await getMessages(locale)).stories.newTitle } : {};
}

/** Share a story about a goal: /stories/new?goal=<slug>[&group=<id>]. */
export default function NewStoryPage({ params, searchParams }: PageProps<"/[locale]/stories/new">) {
  return (
    <Suspense fallback={<div aria-hidden className="bg-muted/60 h-64 animate-pulse rounded-3xl" />}>
      <NewStory params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function NewStory({
  params,
  searchParams,
}: {
  params: PageProps<"/[locale]/stories/new">["params"];
  searchParams: PageProps<"/[locale]/stories/new">["searchParams"];
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const slug = typeof sp.goal === "string" && SLUG_RE.test(sp.goal) ? sp.goal : null;
  if (!slug) notFound();
  const t = await getMessages(locale);
  const user = await requireOnboardedProfile(locale);

  const supabase = await createClient();
  const { data } = await supabase.rpc("goal_details", { p_slug: slug, p_locale: locale });
  const goal = data?.[0];
  if (!goal || (goal.status !== "active" && goal.status !== "merged")) notFound();

  // My groups for this goal, with their members for tagging.
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
  const groupIds = (memberships ?? []).map((m) => m.group_id);
  const { data: groupRows } = groupIds.length
    ? await supabase.from("groups").select("id, name").in("id", groupIds).eq("goal_id", goal.goal_id)
    : { data: [] };
  const groups: ComposerGroup[] = await Promise.all(
    (groupRows ?? []).map(async (g) => {
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id, profile:profiles(display_name, username)")
        .eq("group_id", g.id);
      return {
        id: g.id,
        name: g.name,
        members: (members ?? [])
          .filter((m) => m.user_id !== user.id)
          .map((m) => ({ id: m.user_id, name: m.profile?.display_name || `@${m.profile?.username ?? "?"}` })),
      };
    }),
  );
  const requested = typeof sp.group === "string" && UUID_RE.test(sp.group) ? sp.group : null;
  const defaultGroupId = groups.find((g) => g.id === requested)?.id ?? (groups.length === 1 ? groups[0].id : null);
  const defaultPlace = goal.place_name ?? "";

  return (
    <div className="flex flex-col gap-5 pb-10">
      <h1 className="text-2xl font-bold tracking-tight">{t.stories.newTitle}</h1>
      <StoryComposer
        goalId={goal.goal_id}
        goalTitle={goal.title}
        userId={user.id}
        locale={locale}
        defaultPlace={defaultPlace}
        groups={groups}
        defaultGroupId={defaultGroupId}
        t={{ stories: t.stories, errors: t.errors }}
      />
    </div>
  );
}
