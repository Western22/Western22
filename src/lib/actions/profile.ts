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
    // Chip pickers submit one hidden input per selected value.
    languages: formData.getAll("languages"),
    interests: formData.getAll("interests"),
    travelStyles: formData.getAll("travelStyles"),
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
      languages: parsed.data.languages,
      interests: parsed.data.interests,
      travel_styles: parsed.data.travelStyles,
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
 * Save the caller's location. The database snaps it to a ~5 km grid before
 * storing (set_my_location), and it is never sent back to any client.
 */
export async function saveMyLocation(lat: number, lng: number): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "notSignedIn" };

  const parsed = locationSchema.safeParse({ lat, lng });
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_location", parsed.data);
  if (error) return { error: "generic" };
  return { ok: true };
}
