"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { MATCH_NOTE_MAX } from "@/lib/matching/config";
import type { FormState } from "@/lib/validation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Let's do this together": ask the owner of another item on the same goal.
 * The database checks the item is still matchable (not private, not blocked),
 * rate-limits, and rejects duplicates.
 */
export async function sendMatchRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const myItemId = String(formData.get("myItemId") ?? "");
  const theirItemId = String(formData.get("theirItemId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID_RE.test(myItemId) || !UUID_RE.test(theirItemId)) return { error: "invalidInput" };
  if (note.length > MATCH_NOTE_MAX) return { error: "noteTooLong", values: { note } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_match_request", {
    p_my_item_id: myItemId,
    p_their_item_id: theirItemId,
    p_note: note || null,
  });
  if (error) {
    const key =
      error.code === "23505"
        ? error.hint === "reverse"
          ? "theyAskedYou"
          : "alreadyAsked"
        : error.code === "54000"
          ? "tooManyMatchRequests"
          : error.code === "22023"
            ? "matchUnavailable"
            : "generic";
    return { error: key, values: { note } };
  }
  refresh();
  return { ok: true };
}

/** Accept (become buddies) or decline a request sent to you. */
export async function respondMatchRequest(requestId: string, accept: boolean): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };
  if (!UUID_RE.test(requestId)) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_match_request", { p_request_id: requestId, p_accept: accept });
  if (error) return { error: error.code === "22023" ? "matchUnavailable" : "generic" };
  refresh();
  return { ok: true };
}

/** Block someone: hides you from each other in matching, removes follows, cancels pending requests. */
export async function blockUser(userId: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };
  if (!UUID_RE.test(userId) || userId === user.id) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("block_user", { p_user_id: userId });
  if (error) return { error: "generic" };
  refresh();
  return { ok: true };
}

export async function unblockUser(userId: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };
  if (!UUID_RE.test(userId)) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_user", { p_user_id: userId });
  if (error) return { error: "generic" };
  refresh();
  return { ok: true };
}
