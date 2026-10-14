import { z } from "zod";
import { BUCKET_VISIBILITIES } from "@/lib/supabase/database.types";
import { INTERESTS, LANGUAGE_CODES, MAX_LANGUAGES, TRAVEL_STYLES } from "@/lib/onboarding";
import type { ErrorKey } from "@/i18n/messages/en";

/**
 * Validation schemas shared by Server Actions. Error messages are i18n keys
 * (see messages.errors), never user-facing text, so the UI can translate them.
 * The database enforces the same rules with CHECK constraints.
 */

/** Empty form fields arrive as "", which we store as null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/);

export const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([A-Z]{2})?$/)
  .transform((v) => (v === "" ? null : v));

export const languagesSchema = z.array(z.enum(LANGUAGE_CODES)).max(MAX_LANGUAGES);
export const interestsSchema = z.array(z.enum(INTERESTS)).max(INTERESTS.length);
export const travelStylesSchema = z.array(z.enum(TRAVEL_STYLES)).max(TRAVEL_STYLES.length);

export const profileSchema = z.object({
  username: usernameSchema,
  displayName: optionalText(60),
  bio: optionalText(500),
  homeCity: optionalText(100),
  homeCountry: countrySchema,
  languages: languagesSchema,
  interests: interestsSchema,
  travelStyles: travelStylesSchema,
});

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const bucketItemSchema = z.object({
  title: z.string().trim().min(3).max(140),
  goalId: z.uuid().nullable().optional(),
  visibility: z.enum(BUCKET_VISIBILITIES as [string, ...string[]]).default("public"),
});

/** Form state returned by every Server Action used with useActionState. */
export type FormState = {
  ok?: boolean;
  /** Top-level error, an i18n key under messages.errors. */
  error?: ErrorKey;
  /** Per-field errors, keyed by input name. */
  fieldErrors?: Partial<Record<string, ErrorKey>>;
  /**
   * What the user typed, echoed back on error. React 19 resets a form after
   * its action runs, so inputs use these as defaultValue to keep the user's
   * input. Never include passwords.
   */
  values?: Record<string, string>;
};

/** Collect the named text fields from a submission for FormState.values. */
export function echoValues(formData: FormData, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const v = formData.get(name);
    if (typeof v === "string") out[name] = v;
  }
  return out;
}

/** Turn a ZodError into per-field i18n keys. */
export function toFieldErrors(error: z.ZodError): FormState["fieldErrors"] {
  const out: Record<string, ErrorKey> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!out[field]) out[field] = "invalidInput";
  }
  return out;
}
