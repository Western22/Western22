"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { echoValues, locationSchema, profileSchema, toFieldErrors, type FormState } from "@/lib/validation";

/** Postgres unique_violation, raised when a username is already taken. */
const UNIQUE_VIOLATION = "23505";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const parsed = profileSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    bio: formData.get("bio"),
    homeCity: formData.get("homeCity"),
    homeCountry: formData.get("homeCountry") ?? "",
  });
  const values = echoValues(formData, ["username", "displayName", "bio", "homeCity", "homeCountry"]);
  if (!parsed.success) return { error: "invalidInput", fieldErrors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      username: parsed.data.username,
      display_name: parsed.data.displayName ?? null,
      bio: parsed.data.bio ?? null,
      home_city: parsed.data.homeCity ?? null,
      home_country: parsed.data.homeCountry,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { fieldErrors: { username: "usernameTaken" }, values };
    return { error: "generic", values };
  }
  refresh();
  return { ok: true };
}

/**
 * Save the caller's exact location. The coordinates go straight into the
 * owner-only profile_locations table and are never sent back to any client.
 */
export async function saveMyLocation(lat: number, lng: number): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const parsed = locationSchema.safeParse({ lat, lng });
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_location", parsed.data);
  if (error) return { error: "generic" };
  refresh();
  return { ok: true };
}
