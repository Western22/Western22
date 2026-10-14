import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/en";
import type { NotificationType } from "@/lib/supabase/database.types";

/** The fields every surface (center, email, push) needs to describe a notification. */
export type NotificationFacts = {
  type: Exclude<NotificationType, "weekly_digest">;
  count: number;
  actor_name: string | null;
  group_id: string | null;
  group_name: string | null;
  goal_title: string | null;
  story_id: string | null;
  item_id: string | null;
  data: { starts_on?: string; days?: number } | null;
};

export type RenderedNotification = {
  /** One sentence, e.g. "3 new messages in Kili crew." */
  text: string;
  /** Button label for email, e.g. "Open the chat". */
  action: string;
  /** Path under the locale, e.g. "/en/groups/<id>?tab=chat". */
  path: string;
};

/**
 * Turns a notification into words and a link. Pure, so the notification
 * center (client), emails and push payloads (server) all say the same thing.
 *
 * TODO(notifications): comments, new followers and group join requests don't
 * notify yet; add a type in migration 0010's notification_types() and a case here.
 */
export function renderNotification(n: NotificationFacts, nt: Messages["notifications"], locale: string): RenderedNotification {
  const name = n.actor_name ?? nt.someone;
  const group = n.group_name ?? nt.yourGroup;
  const goal = n.goal_title ?? nt.yourGoal;
  const many = n.count > 1;
  const groupPath = (tab: string) => (n.group_id ? `/${locale}/groups/${n.group_id}?tab=${tab}` : `/${locale}/groups`);

  switch (n.type) {
    case "new_match":
      return {
        text: many ? format(nt.text.new_match.many, { count: n.count, goal }) : format(nt.text.new_match.one, { name, goal }),
        action: nt.action.new_match,
        path: n.item_id ? `/${locale}/items/${n.item_id}/matches` : `/${locale}/items`,
      };
    case "buddy_request":
      return { text: format(nt.text.buddy_request, { name, goal }), action: nt.action.buddy_request, path: `/${locale}/requests` };
    case "request_accepted":
      return { text: format(nt.text.request_accepted, { name, goal }), action: nt.action.request_accepted, path: `/${locale}/requests` };
    case "group_message":
      return {
        text: many ? format(nt.text.group_message.many, { count: n.count, group }) : format(nt.text.group_message.one, { name, group }),
        action: nt.action.group_message,
        path: groupPath("chat"),
      };
    case "plan_vote":
      return {
        text: many ? format(nt.text.plan_vote.many, { count: n.count, group }) : format(nt.text.plan_vote.one, { name, group }),
        action: nt.action.plan_vote,
        path: groupPath("plan"),
      };
    case "date_approaching": {
      const startsOn = n.data?.starts_on;
      // starts_on is a calendar date; format it in UTC so it never shifts a day.
      const date = startsOn
        ? new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(startsOn))
        : "";
      const template = n.data?.days === 1 ? nt.text.date_approaching.day : nt.text.date_approaching.week;
      return { text: format(template, { group, date }), action: nt.action.date_approaching, path: groupPath("plan") };
    }
    case "story_reaction":
      return {
        text: many
          ? format(nt.text.story_reaction.many, { name, others: n.count - 1, goal })
          : format(nt.text.story_reaction.one, { name, goal }),
        action: nt.action.story_reaction,
        path: n.story_id ? `/${locale}/stories/${n.story_id}` : `/${locale}`,
      };
  }
}
