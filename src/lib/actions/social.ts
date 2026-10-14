"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { moderateText } from "@/lib/moderation";
import { safetyError } from "@/lib/db-errors";
import { REACTION_KINDS, type ReactionKind } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/validation";
import { defaultLocale, isLocale } from "@/i18n/config";

/**
 * Social Server Actions: follows, stories, reactions, comments, adding a goal
 * from a story, and badge celebrations. RLS and RPCs enforce the rules
 * (blocks, ownership, valid photo URLs, group tags); these validate input.
 */

const uuid = z.string().uuid();

async function signedIn() {
  const user = await getCurrentUser();
  return user ? { user, supabase: await createClient() } : null;
}

export async function follow(userId: string): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  if (!uuid.safeParse(userId).success || userId === ctx.user.id) return { error: "invalidInput" };
  const { error } = await ctx.supabase.from("follows").insert({ follower_id: ctx.user.id, followee_id: userId });
  // Already following is fine.
  if (error && error.code !== "23505") return { error: safetyError(error) ?? "generic" };
  refresh();
  return { ok: true };
}

export async function unfollow(userId: string): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  if (!uuid.safeParse(userId).success) return { error: "invalidInput" };
  const { error } = await ctx.supabase.from("follows").delete().eq("follower_id", ctx.user.id).eq("followee_id", userId);
  if (error) return { error: "generic" };
  refresh();
  return { ok: true };
}

const storySchema = z.object({
  goalId: uuid,
  groupId: uuid.nullable(),
  body: z.string().trim().min(1, "invalidInput").max(2000, "invalidInput"),
  place: z.string().trim().max(100, "invalidInput"),
  photoUrls: z.array(z.string().url().max(2048)).max(4),
  tagged: z.array(uuid).max(20),
});

/**
 * Post a story. Photos were already resized and uploaded by the browser to
 * the caller's folder in the public stories bucket; create_story() checks
 * every URL is theirs and that tags are fellow group members.
 */
export async function createStory(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const body = String(formData.get("body") ?? "");
  const parsed = storySchema.safeParse({
    goalId: formData.get("goalId"),
    groupId: formData.get("groupId") || null,
    body,
    place: formData.get("place") ?? "",
    photoUrls: formData.getAll("photoUrl").map(String),
    tagged: formData.getAll("tagged").map(String),
  });
  const values = { body, place: String(formData.get("place") ?? "") };
  if (!parsed.success) return { error: "invalidInput", values };
  const verdict = await moderateText(`${parsed.data.body} ${parsed.data.place}`, { kind: "story" });
  if (verdict.decision === "block") return { error: "contentBlocked", values };

  const { data, error } = await ctx.supabase.rpc("create_story", {
    p_goal_id: parsed.data.goalId,
    p_body: parsed.data.body,
    p_group_id: parsed.data.groupId,
    p_place: parsed.data.place || null,
    p_photo_urls: parsed.data.photoUrls,
    p_tagged: parsed.data.groupId ? parsed.data.tagged : [],
  });
  if (error || !data) {
    const key = safetyError(error) ?? (error?.code === "54000" ? "tooManyStories" : error?.code === "22023" ? "invalidInput" : "generic");
    return { error: key, values };
  }
  if (verdict.decision === "review") {
    await ctx.supabase.rpc("flag_my_content", { p_target_type: "story", p_target_id: data, p_categories: verdict.categories });
  }
  const locale = String(formData.get("locale") ?? "");
  redirect(`/${isLocale(locale) ? locale : defaultLocale}/stories/${data}`);
}

export async function setReaction(storyId: string, kind: ReactionKind, on: boolean): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(storyId).success || !REACTION_KINDS.includes(kind)) return;
  if (on) await ctx.supabase.from("story_reactions").insert({ story_id: storyId, kind });
  else await ctx.supabase.from("story_reactions").delete().eq("story_id", storyId).eq("user_id", ctx.user.id).eq("kind", kind);
  refresh();
}

export async function addComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  const storyId = uuid.safeParse(formData.get("storyId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!storyId.success || !body || body.length > 500) return { error: "invalidInput", values: { body } };
  const verdict = await moderateText(body, { kind: "comment" });
  if (verdict.decision === "block") return { error: "contentBlocked", values: { body } };
  const { data, error } = await ctx.supabase.from("story_comments").insert({ story_id: storyId.data, body }).select("id").single();
  // The insert policy also caps comments per hour; a refusal there is a 42501.
  if (error) return { error: safetyError(error) ?? (error.code === "42501" ? "tooManyComments" : "generic"), values: { body } };
  if (verdict.decision === "review") {
    await ctx.supabase.rpc("flag_my_content", { p_target_type: "comment", p_target_id: data.id, p_categories: verdict.categories });
  }
  refresh();
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(commentId).success) return;
  await ctx.supabase.from("story_comments").delete().eq("id", commentId);
  refresh();
}

/** The growth loop: put a story's goal on your own list, remembering which story inspired it. */
export async function addGoalFromStory(storyId: string): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return { error: "notSignedIn" };
  if (!uuid.safeParse(storyId).success) return { error: "invalidInput" };
  const { error } = await ctx.supabase.rpc("add_goal_from_story", { p_story_id: storyId });
  if (error) return { error: error.code === "23505" ? "alreadyOnList" : "generic" };
  refresh();
  return { ok: true };
}

export async function untagMe(storyId: string): Promise<void> {
  const ctx = await signedIn();
  if (!ctx || !uuid.safeParse(storyId).success) return;
  await ctx.supabase.from("story_tags").delete().eq("story_id", storyId).eq("user_id", ctx.user.id);
  refresh();
}

/** Record that the caller has seen their new badges, so each is celebrated once. */
export async function markBadgesSeen(): Promise<void> {
  const ctx = await signedIn();
  if (!ctx) return;
  await ctx.supabase.rpc("mark_badges_seen");
  refresh();
}
