import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Service-role client for the few things RLS can't do on a user's behalf:
 * deleting an auth user (account deletion), banning a suspended user's
 * sessions, and removing their uploaded files. Server-only; never import it
 * from a Client Component.
 *
 * Needs SUPABASE_SECRET_KEY (Project Settings > API > secret key). Returns
 * null when it isn't set, so callers can explain instead of crashing.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  const { url } = getSupabaseEnv();
  return createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
