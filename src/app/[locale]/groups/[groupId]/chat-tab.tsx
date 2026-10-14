import { canTranslateInto } from "@/lib/translation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";
import type { GroupContext } from "./page";
import { Chat, type ChatMember } from "./chat";

const INITIAL_MESSAGES = 100;

/** Loads the latest messages and members, then hands over to the realtime chat. */
export async function ChatTab({ ctx, locale, t }: { ctx: GroupContext; locale: Locale; t: Messages }) {
  const supabase = await createClient();
  const [{ data: messages, error }, { data: members }] = await Promise.all([
    supabase
      .from("group_messages")
      .select("id, group_id, sender_id, body, image_path, created_at, hidden_at")
      .eq("group_id", ctx.id)
      .order("created_at", { ascending: false })
      .limit(INITIAL_MESSAGES),
    supabase
      .from("group_members")
      .select("user_id, last_read_at, profile:profiles(username, display_name, avatar_url)")
      .eq("group_id", ctx.id),
  ]);
  if (error) throw new Error("Could not load messages");

  const chatMembers: ChatMember[] = (members ?? []).map((m) => ({
    id: m.user_id,
    name: m.profile?.display_name || (m.profile?.username ? `@${m.profile.username}` : "?"),
    avatarUrl: m.profile?.avatar_url ?? null,
    lastReadAt: m.last_read_at,
  }));

  return (
    <Chat
      groupId={ctx.id}
      me={ctx.me}
      initialMessages={[...messages].reverse()}
      truncated={messages.length === INITIAL_MESSAGES}
      initialMembers={chatMembers}
      locale={locale}
      canTranslate={await canTranslateInto(locale)}
      t={{ chat: t.groups.chat, errors: t.errors, report: t.report, translate: t.translate }}
    />
  );
}
