"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  BUCKET_STATUSES,
  type BucketCategory,
  type BucketStatus,
  type BucketVisibility,
} from "@/lib/supabase/database.types";
import { bucketItemSchema, echoValues, toFieldErrors, type FormState } from "@/lib/validation";

export async function createItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const parsed = bucketItemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category") || undefined,
    visibility: formData.get("visibility") || undefined,
    placeName: formData.get("placeName"),
  });
  const values = echoValues(formData, ["title", "description", "category", "visibility", "placeName"]);
  if (!parsed.success) return { error: "invalidInput", fieldErrors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.from("bucket_items").insert({
    owner_id: user.id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    category: parsed.data.category as BucketCategory,
    visibility: parsed.data.visibility as BucketVisibility,
    place_name: parsed.data.placeName ?? null,
  });
  if (error) return { error: "generic", values };

  refresh();
  return { ok: true };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Set an item's status. Server Actions are public endpoints, so inputs are
 * re-validated here; RLS additionally guarantees only the owner's row changes.
 * Failures throw so the nearest error boundary shows them (never silent).
 */
export async function setItemStatus(itemId: string, status: BucketStatus): Promise<void> {
  if (!UUID_RE.test(itemId) || !BUCKET_STATUSES.includes(status)) throw new Error("Invalid input");
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  const supabase = await createClient();
  // completed_at is maintained by a database trigger.
  const { error } = await supabase
    .from("bucket_items")
    .update({ status })
    .eq("id", itemId)
    .eq("owner_id", user.id);
  if (error) throw new Error("Could not update item");
  refresh();
}

export async function deleteItem(itemId: string): Promise<void> {
  if (!UUID_RE.test(itemId)) throw new Error("Invalid input");
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");

  const supabase = await createClient();
  const { error } = await supabase.from("bucket_items").delete().eq("id", itemId).eq("owner_id", user.id);
  if (error) throw new Error("Could not delete item");
  refresh();
}
