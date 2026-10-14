"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { safetyError } from "@/lib/db-errors";
import {
  REPORT_REASONS,
  REPORT_TARGET_TYPES,
  type ModerationAction,
  type ReportReason,
  type ReportTargetType,
} from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { defaultLocale, isLocale } from "@/i18n/config";

/**
 * Trust and safety Server Actions: reports, blocking from a report, the
 * moderation queue's actions, warnings, safety tips, plan sharing, privacy
 * settings and account deletion. The database enforces who may do what.
 */

const uuid = z.string().uuid();

async function signedIn() {
  const user = await getCurrentUser();
  return user ? { user, supabase: await createClient() } : null;
}

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES as [ReportTargetType, ...ReportTargetType[]]),
  targetId: uuid,
  reason: z.enum(REPORT_REASONS as [ReportReason, ...ReportReason[]]),
  details: z.string().trim().max(500),
  // When set, also block this person (the content's author or the reported user).
  blockUserId: uuid.or(z.literal("")),
});

export async function reportContent(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const parsed = reportSchema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason"),
    details: formData.get("details") ?? "",
    blockUserId: formData.get("block") === "on" ? formData.get("blockUserId") ?? "" : "",
  });
  if (!parsed.success) return { error: "invalidInput", values: { details: String(formData.get("details") ?? "") } };
  const { targetType, targetId, reason, details, blockUserId } = parsed.data;

  const { error } = await ctx.supabase.rpc("report_content", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_details: details || null,
  });
  if (error) return { error: safetyError(error) ?? (error.code === "22023" ? "reportUnavailable" : "generic") };
  if (blockUserId && blockUserId !== ctx.user.id) {
    // Already blocked is fine.
    await ctx.supabase.rpc("block_user", { p_user_id: blockUserId });
  }
  refresh();
  return { ok: true };
}

const moderateSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES as [ReportTargetType, ...ReportTargetType[]]),
  targetId: uuid,
  action: z.enum(["dismiss", "warn", "remove", "suspend", "unsuspend"] satisfies ModerationAction[]),
  note: z.string().trim().max(500),
  // "" = indefinitely (only for suspend).
  days: z.union([z.literal(""), z.coerce.number().int().min(1).max(3650)]),
});

/** A moderator acts on a reported target. Suspending also signs the person out everywhere. */
export async function moderate(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const parsed = moderateSchema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    action: formData.get("action"),
    note: formData.get("note") ?? "",
    days: formData.get("days") ?? "",
  });
  if (!parsed.success) return { error: "invalidInput" };
  const { targetType, targetId, action, note, days } = parsed.data;
  if (action === "warn" && !note) return { error: "warningNeedsMessage" };

  const { data: who, error } = await ctx.supabase.rpc("moderate", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_action: action,
    p_note: note || null,
    p_suspend_days: action === "suspend" && days !== "" ? days : null,
  });
  if (error) return { error: error.code === "42501" ? "moderatorsOnly" : "generic" };

  // The database already blocks a suspended person's writes. Banning the auth
  // user too ends their sessions at the next token refresh.
  if (who && (action === "suspend" || action === "unsuspend")) {
    const admin = createAdminClient();
    if (admin) {
      const banDuration = action === "unsuspend" ? "none" : days === "" ? "876000h" : `${days * 24}h`;
      const { error: banError } = await admin.auth.admin.updateUserById(who, { ban_duration: banDuration });
      if (banError) console.error("could not update auth ban", banError);
    }
  }
  refresh();
  return { ok: true };
}

export async function acknowledgeWarning(warningId: string): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(warningId).success) return;
  await ctx.supabase.rpc("acknowledge_warning", { p_warning_id: warningId });
  refresh();
}

export async function acknowledgeSafetyTips(): Promise<void> {
  const ctx = await signedIn();
  if (!ctx) return;
  await ctx.supabase.rpc("acknowledge_safety_tips");
  refresh();
}

export async function createPlanShare(_prev: FormState, formData: FormData): Promise<FormState & { shareId?: string }> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const groupId = uuid.safeParse(formData.get("groupId"));
  const contactName = String(formData.get("contactName") ?? "").trim();
  const days = Number(formData.get("days") ?? 14);
  if (!groupId.success || !contactName || contactName.length > 60 || ![3, 7, 14, 30].includes(days)) {
    return { error: "invalidInput", values: { contactName } };
  }
  const { data, error } = await ctx.supabase.rpc("create_plan_share", {
    p_group_id: groupId.data,
    p_contact_name: contactName,
    p_days: days,
  });
  if (error || !data) return { error: safetyError(error) ?? "generic", values: { contactName } };
  refresh();
  return { ok: true, shareId: data };
}

export async function revokePlanShare(shareId: string): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(shareId).success) return;
  await ctx.supabase.rpc("revoke_plan_share", { p_share_id: shareId });
  refresh();
}

export async function updatePrivacy(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const { error } = await ctx.supabase.rpc("update_privacy_settings", {
    p_hide_from_matching: formData.get("hideFromMatching") === "on",
    p_approximate_location: formData.get("approximateLocation") === "on",
  });
  if (error) return { error: "generic" };
  refresh();
  return { ok: true };
}

/**
 * Delete the signed-in account. The person types their username (or DELETE
 * when they have none) to confirm. Order: hand group ownership on and list
 * files (prepare_account_deletion), remove the files, then delete the auth
 * user, which cascades to every table.
 */
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const { data: profile } = await ctx.supabase.from("profiles").select("username").eq("id", ctx.user.id).single();
  const expected = profile?.username ?? "DELETE";
  if (String(formData.get("confirm") ?? "").trim() !== expected) return { error: "confirmMismatch" };

  const admin = createAdminClient();
  if (!admin) return { error: "deletionUnavailable" };

  const { data: files, error } = await ctx.supabase.rpc("prepare_account_deletion");
  if (error) return { error: "generic" };
  const byBucket = new Map<string, string[]>();
  for (const f of files ?? []) byBucket.set(f.bucket_id, [...(byBucket.get(f.bucket_id) ?? []), f.name]);
  for (const [bucket, names] of byBucket) {
    const { error: removeError } = await admin.storage.from(bucket).remove(names);
    if (removeError) console.error("could not remove files during account deletion", bucket, removeError);
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(ctx.user.id);
  if (deleteError) return { error: "generic" };

  await ctx.supabase.auth.signOut();
  const locale = String(formData.get("locale") ?? "");
  redirect(`/${isLocale(locale) ? locale : defaultLocale}?deleted=1`);
}
