"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { bucketItemSchema, echoValues, itemUpdateSchema, toFieldErrors, type FormState } from "@/lib/validation";
import { defaultLocale, isLocale } from "@/i18n/config";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AddResult = Database["public"]["Functions"]["add_bucket_item"]["Returns"][number];

const UNIQUE_VIOLATION = "23505";

/**
 * Add an item from free text through add_bucket_item(), which links it to the
 * chosen goal, an exact or close (trigram) match, or a new pending goal.
 */
export async function createItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const parsed = bucketItemSchema.safeParse({
    title: formData.get("title"),
    goalId: formData.get("goalId") || null,
    visibility: formData.get("visibility") || undefined,
    timeframe: formData.get("timeframe") || undefined,
    flexibility: formData.get("flexibility") || undefined,
    budget: formData.get("budget") ?? "",
  });
  const values = echoValues(formData, ["title", "visibility", "timeframe", "flexibility", "budget"]);
  if (!parsed.success) return { error: "invalidInput", fieldErrors: toFieldErrors(parsed.error), values };

  const locale = String(formData.get("locale") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_bucket_item", {
    p_title: parsed.data.title,
    p_goal_id: parsed.data.goalId ?? null,
    p_visibility: parsed.data.visibility,
    p_locale: isLocale(locale) ? locale : defaultLocale,
    p_timeframe: parsed.data.timeframe,
    p_flexibility: parsed.data.flexibility,
    p_budget: parsed.data.budget,
  });
  if (error || !data[0]) return { error: error?.code === UNIQUE_VIOLATION ? "alreadyOnList" : "generic", values };

  const added = await describeMatch(supabase, data[0], isLocale(locale) ? locale : defaultLocale);
  refresh();
  return { ok: true, added };
}

/** The goal an item was linked to, for the "Added …" confirmation. */
async function describeMatch(supabase: SupabaseClient, result: AddResult, locale: string): Promise<FormState["added"]> {
  const [{ data: goal }, { data: title }] = await Promise.all([
    supabase.from("goals").select("slug").eq("id", result.goal_id).single(),
    supabase.rpc("goal_title", { p_goal_id: result.goal_id, p_locale: locale }),
  ]);
  return { match: result.match, goalTitle: title ?? "", goalSlug: goal?.slug ?? "" };
}

/**
 * Update an item's details. Server Actions are public endpoints, so inputs are
 * re-validated here; RLS additionally guarantees only the owner's row changes.
 */
export async function updateItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const parsed = itemUpdateSchema.safeParse({
    itemId: formData.get("itemId"),
    status: formData.get("status"),
    visibility: formData.get("visibility"),
    timeframe: formData.get("timeframe"),
    flexibility: formData.get("flexibility"),
    budget: formData.get("budget") ?? "",
  });
  if (!parsed.success) return { error: "invalidInput", fieldErrors: toFieldErrors(parsed.error) };

  const { itemId, ...changes } = parsed.data;
  const supabase = await createClient();
  // completed_at is maintained by a database trigger.
  const { error } = await supabase.from("bucket_items").update(changes).eq("id", itemId).eq("owner_id", user.id);
  if (error) return { error: "generic" };
  refresh();
  return { ok: true };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Failures throw so the nearest error boundary shows them (never silent). */
export async function deleteItem(itemId: string): Promise<void> {
  if (!UUID_RE.test(itemId)) throw new Error("Invalid input");
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  const supabase = await createClient();
  const { error } = await supabase.from("bucket_items").delete().eq("id", itemId).eq("owner_id", user.id);
  if (error) throw new Error("Could not delete item");
  refresh();
}

/** One-tap add from a goal page (default details; editable on My list). */
export async function addGoalToList(goalId: string, title: string, locale: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };
  if (!UUID_RE.test(goalId)) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_bucket_item", {
    p_title: title.slice(0, 140),
    p_goal_id: goalId,
    p_locale: isLocale(locale) ? locale : defaultLocale,
  });
  if (error) return { error: error.code === UNIQUE_VIOLATION ? "alreadyOnList" : "generic" };
  refresh();
  return { ok: true };
}
