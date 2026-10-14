"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";

/**
 * Server Actions for notifications. The database (migration 0010) checks
 * ownership and values again; these only parse input and map errors.
 */

async function signedIn() {
  const user = await getCurrentUser();
  return user ? { user, supabase: await createClient() } : null;
}

const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Mark some notifications (or all, with no ids) as read. */
export async function markNotificationsRead(ids: string[] | null): Promise<void> {
  const ctx = await signedIn();
  if (!ctx) return;
  const parsed = ids === null ? null : z.array(uuid).max(100).safeParse(ids);
  if (parsed && !parsed.success) return;
  await ctx.supabase.rpc("mark_notifications_read", { p_ids: parsed ? parsed.data : null });
  refresh();
}

/** The browser's time zone, sent once so quiet hours and the digest use local time. */
export async function syncTimezone(timezone: string): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || typeof timezone !== "string" || timezone.length > 64) return;
  await ctx.supabase.rpc("sync_my_timezone", { p_timezone: timezone });
}

/**
 * Save the preferences grid and the quiet hours / time zone / pause-email
 * settings from one form. Checkbox names are `<type>:<channel>`.
 */
export async function saveNotificationSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };

  const prefs = NOTIFICATION_TYPES.map((type: NotificationType) => ({
    type,
    in_app: formData.get(`${type}:in_app`) === "on",
    email: formData.get(`${type}:email`) === "on",
    push: formData.get(`${type}:push`) === "on",
  }));

  const quietOn = formData.get("quietOn") === "on";
  const quietStart = String(formData.get("quietStart") ?? "");
  const quietEnd = String(formData.get("quietEnd") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (quietOn && (!time.safeParse(quietStart).success || !time.safeParse(quietEnd).success || quietStart === quietEnd)) {
    return { error: "quietHoursInvalid" };
  }
  if (timezone.length > 64) return { error: "timezoneInvalid" };

  const { error: prefsError } = await ctx.supabase.rpc("set_notification_preferences", { p_prefs: prefs });
  if (prefsError) return { error: "generic" };
  const { error } = await ctx.supabase.rpc("update_notification_settings", {
    p_timezone: timezone || null,
    p_quiet_start: quietOn ? quietStart : null,
    p_quiet_end: quietOn ? quietEnd : null,
    p_email_paused: formData.get("emailPaused") === "on",
  });
  if (error) return { error: error.message.includes("time zone") ? "timezoneInvalid" : error.code === "22023" ? "quietHoursInvalid" : "generic" };
  refresh();
  return { ok: true };
}

const pushSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Store this browser's push subscription (the JSON from PushSubscription.toJSON()). */
export async function savePushSubscription(subscription: unknown): Promise<{ ok: boolean }> {
  const ctx = await signedIn();
  const parsed = pushSchema.safeParse(subscription);
  if (!ctx || !parsed.success) return { ok: false };
  const { error } = await ctx.supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
  });
  return { ok: !error };
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || typeof endpoint !== "string" || endpoint.length > 1000) return;
  await ctx.supabase.rpc("delete_push_subscription", { p_endpoint: endpoint });
}

/** The unsubscribe page's button. Works signed out: the token is the key. */
export async function unsubscribe(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = uuid.safeParse(formData.get("token"));
  const type = String(formData.get("type") ?? "all");
  if (!token.success || !(type === "all" || (NOTIFICATION_TYPES as readonly string[]).includes(type))) {
    return { error: "invalidInput" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_email", { p_token: token.data, p_type: type });
  if (error || !data) return { error: "invalidInput" };
  return { ok: true };
}
