"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { moderateText } from "@/lib/moderation";
import { safetyError } from "@/lib/db-errors";
import {
  CHECKLIST_CATEGORIES,
  GROUP_STATUSES,
  type ChecklistCategory,
  type GroupMessage,
  type GroupStatus,
} from "@/lib/supabase/database.types";
import { toFieldErrors, type FormState } from "@/lib/validation";
import type { ErrorKey } from "@/i18n/messages/en";
import { defaultLocale, isLocale } from "@/i18n/config";

/**
 * Group Server Actions. The database does the real checks (membership, owner
 * role, size, blocks) in RPCs and RLS; these validate input and map errors.
 */

const uuid = z.string().uuid();

const groupSettingsSchema = z.object({
  name: z.string().trim().min(1, "invalidInput").max(80, "invalidInput"),
  description: z.string().trim().max(500, "invalidInput").transform((v) => v || null),
  maxSize: z.coerce.number().int().min(2, "invalidInput").max(20, "invalidInput"),
  joinPolicy: z.enum(["open", "request"]),
});

/** Map Postgres error codes from the group RPCs to i18n error keys. */
function groupError(error: { code?: string; message?: string; hint?: string | null } | null): ErrorKey {
  const safety = safetyError(error);
  if (safety) return safety;
  switch (error?.code) {
    case "54000":
      return error.message?.includes("full") ? "groupFull" : error.message?.includes("groups") ? "tooManyGroups" : "tooManyMatchRequests";
    case "42501":
      return "notAllowed";
    case "22023":
      return error.message?.includes("closed") ? "groupClosed" : error.message?.includes("too long") ? "noteTooLong" : "groupUnavailable";
    case "23514":
      return "invalidInput";
    default:
      return "generic";
  }
}

async function signedIn() {
  const user = await getCurrentUser();
  return user ? { user, supabase: await createClient() } : null;
}

function readLocale(formData: FormData): string {
  const locale = String(formData.get("locale") ?? "");
  return isLocale(locale) ? locale : defaultLocale;
}

export async function createGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const goalId = uuid.safeParse(formData.get("goalId"));
  const parsed = groupSettingsSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    maxSize: formData.get("maxSize") || 6,
    joinPolicy: formData.get("joinPolicy") || "open",
  });
  const values = { name: String(formData.get("name") ?? ""), description: String(formData.get("description") ?? "") };
  if (!goalId.success) return { error: "invalidInput" };
  if (!parsed.success) return { error: "invalidInput", fieldErrors: toFieldErrors(parsed.error), values };
  const verdict = await moderateText(`${parsed.data.name} ${parsed.data.description ?? ""}`, { kind: "group" });
  if (verdict.decision === "block") return { error: "contentBlocked", values };

  const { data, error } = await ctx.supabase.rpc("create_group", {
    p_goal_id: goalId.data,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_max_size: parsed.data.maxSize,
    p_join_policy: parsed.data.joinPolicy,
  });
  if (error || !data) return { error: groupError(error), values };
  if (verdict.decision === "review") {
    await ctx.supabase.rpc("flag_my_content", { p_target_type: "group", p_target_id: data, p_categories: verdict.categories });
  }
  redirect(`/${readLocale(formData)}/groups/${data}`);
}

/** Join an open group, or ask to join one that reviews requests. */
export async function joinGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const groupId = uuid.safeParse(formData.get("groupId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!groupId.success || note.length > 280) return { error: "invalidInput" };

  const { data, error } = await ctx.supabase.rpc("join_group", { p_group_id: groupId.data, p_note: note || null });
  if (error) return { error: groupError(error) };
  if (data === "joined") redirect(`/${readLocale(formData)}/groups/${groupId.data}`);
  refresh();
  return { ok: true };
}

export async function cancelJoinRequest(groupId: string): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  if (!uuid.safeParse(groupId).success) return { error: "invalidInput" };
  const { error } = await ctx.supabase.rpc("cancel_join_request", { p_group_id: groupId });
  if (error) return { error: groupError(error) };
  refresh();
  return { ok: true };
}

export async function respondJoinRequest(requestId: string, accept: boolean): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  if (!uuid.safeParse(requestId).success) return { error: "invalidInput" };
  const { error } = await ctx.supabase.rpc("respond_join_request", { p_request_id: requestId, p_accept: accept });
  if (error) return { error: groupError(error) };
  refresh();
  return { ok: true };
}

export async function leaveGroup(groupId: string, locale: string): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  if (!uuid.safeParse(groupId).success) return { error: "invalidInput" };
  const { error } = await ctx.supabase.rpc("leave_group", { p_group_id: groupId });
  if (error) return { error: groupError(error) };
  redirect(`/${isLocale(locale) ? locale : defaultLocale}/groups`);
}

export async function removeGroupMember(groupId: string, userId: string): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  if (!uuid.safeParse(groupId).success || !uuid.safeParse(userId).success) return { error: "invalidInput" };
  const { error } = await ctx.supabase.rpc("remove_group_member", { p_group_id: groupId, p_user_id: userId });
  if (error) return { error: groupError(error) };
  refresh();
  return { ok: true };
}

export async function updateGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const groupId = uuid.safeParse(formData.get("groupId"));
  const parsed = groupSettingsSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    maxSize: formData.get("maxSize"),
    joinPolicy: formData.get("joinPolicy"),
  });
  if (!groupId.success) return { error: "invalidInput" };
  if (!parsed.success) return { error: "invalidInput", fieldErrors: toFieldErrors(parsed.error) };
  const verdict = await moderateText(`${parsed.data.name} ${parsed.data.description ?? ""}`, { kind: "group" });
  if (verdict.decision === "block") return { error: "contentBlocked" };
  const { error } = await ctx.supabase.rpc("update_group", {
    p_group_id: groupId.data,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_max_size: parsed.data.maxSize,
    p_join_policy: parsed.data.joinPolicy,
  });
  if (error) return { error: groupError(error) };
  if (verdict.decision === "review") {
    await ctx.supabase.rpc("flag_my_content", { p_target_type: "group", p_target_id: groupId.data, p_categories: verdict.categories });
  }
  refresh();
  return { ok: true };
}

/**
 * Send a chat message. Runs text moderation first; the photo (if any) was
 * already resized and uploaded by the browser into the group's folder, which
 * the table's check constraint and storage policies enforce.
 */
export async function sendMessage(
  groupId: string,
  body: string,
  imagePath: string | null,
): Promise<{ message?: GroupMessage; error?: ErrorKey }> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const text = body.trim();
  if (!uuid.safeParse(groupId).success || text.length > 2000 || (!text && !imagePath)) return { error: "invalidInput" };
  if (imagePath && !imagePath.startsWith(`${groupId}/`)) return { error: "invalidInput" };
  const verdict = await moderateText(text, { kind: "message" });
  if (verdict.decision === "block") return { error: "contentBlocked" };

  const { data, error } = await ctx.supabase
    .from("group_messages")
    .insert({ group_id: groupId, body: text || null, image_path: imagePath })
    .select("id, group_id, sender_id, body, image_path, created_at, hidden_at")
    .single();
  if (error) return { error: groupError(error) };
  if (verdict.decision === "review") {
    await ctx.supabase.rpc("flag_my_content", { p_target_type: "message", p_target_id: data.id, p_categories: verdict.categories });
  }
  return { message: data };
}

const planSchema = z.object({
  location: z.string().trim().max(120, "invalidInput"),
  budget: z.union([z.literal(""), z.coerce.number().int().min(0, "invalidInput").max(10_000_000, "invalidInput")]),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "invalidInput"),
  notes: z.string().trim().max(1000, "invalidInput"),
});

export async function updatePlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const groupId = uuid.safeParse(formData.get("groupId"));
  const parsed = planSchema.safeParse({
    location: formData.get("location") ?? "",
    budget: formData.get("budget") ?? "",
    currency: formData.get("currency") || "USD",
    notes: formData.get("notes") ?? "",
  });
  if (!groupId.success) return { error: "invalidInput" };
  if (!parsed.success) return { error: "invalidInput", fieldErrors: toFieldErrors(parsed.error) };
  const { error } = await ctx.supabase.rpc("update_group_plan", {
    p_group_id: groupId.data,
    p_location: parsed.data.location || null,
    p_budget_amount: parsed.data.budget === "" ? null : parsed.data.budget,
    p_budget_currency: parsed.data.currency.toUpperCase(),
    p_notes: parsed.data.notes || null,
  });
  if (error) return { error: groupError(error) };
  refresh();
  return { ok: true };
}

export async function setGroupStatus(groupId: string, status: GroupStatus): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  if (!uuid.safeParse(groupId).success || !GROUP_STATUSES.includes(status)) return { error: "invalidInput" };
  const { error } = await ctx.supabase.rpc("set_group_status", { p_group_id: groupId, p_status: status });
  if (error) return { error: groupError(error) };
  refresh();
  return { ok: true };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function proposeDates(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const groupId = uuid.safeParse(formData.get("groupId"));
  const startsOn = String(formData.get("startsOn") ?? "");
  const endsOn = String(formData.get("endsOn") ?? "") || startsOn;
  if (!groupId.success || !DATE_RE.test(startsOn) || !DATE_RE.test(endsOn)) return { error: "invalidInput" };
  if (endsOn < startsOn) return { error: "invalidDates" };
  const { error } = await ctx.supabase.from("group_date_options").insert({ group_id: groupId.data, starts_on: startsOn, ends_on: endsOn });
  if (error) return { error: error.code === "23514" ? "invalidDates" : groupError(error) };
  refresh();
  return { ok: true };
}

export async function setDateVote(optionId: string, vote: boolean): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(optionId).success) return;
  if (vote) await ctx.supabase.from("group_date_votes").insert({ option_id: optionId });
  else await ctx.supabase.from("group_date_votes").delete().eq("option_id", optionId).eq("user_id", ctx.user.id);
  refresh();
}

export async function removeDateOption(optionId: string): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(optionId).success) return;
  await ctx.supabase.from("group_date_options").delete().eq("id", optionId);
  refresh();
}

export async function addChecklistItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const groupId = uuid.safeParse(formData.get("groupId"));
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "other") as ChecklistCategory;
  if (!groupId.success || !title || title.length > 120 || !CHECKLIST_CATEGORIES.includes(category)) {
    return { error: "invalidInput" };
  }
  const { error } = await ctx.supabase.from("group_checklist_items").insert({ group_id: groupId.data, title, category });
  if (error) return { error: groupError(error) };
  refresh();
  return { ok: true };
}

export async function setChecklistDone(itemId: string, done: boolean): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(itemId).success) return;
  await ctx.supabase.from("group_checklist_items").update({ done }).eq("id", itemId);
  refresh();
}

export async function removeChecklistItem(itemId: string): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(itemId).success) return;
  await ctx.supabase.from("group_checklist_items").delete().eq("id", itemId);
  refresh();
}

export async function dismissStoryPrompt(groupId: string): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(groupId).success) return;
  await ctx.supabase.rpc("dismiss_story_prompt", { p_group_id: groupId });
  refresh();
}
