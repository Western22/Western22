import { z } from "zod";
import { BUCKET_CATEGORIES, BUCKET_VISIBILITIES } from "@/lib/supabase/database.types";
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

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "weakPassword" satisfies ErrorKey),
  displayName: optionalText(60),
});

export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/),
  displayName: optionalText(60),
  bio: optionalText(500),
  homeCity: optionalText(100),
  homeCountry: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{2})?$/)
    .transform((v) => (v === "" ? null : v)),
});

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const bucketItemSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: optionalText(2000),
  category: z.enum(BUCKET_CATEGORIES as [string, ...string[]]).default("other"),
  visibility: z.enum(BUCKET_VISIBILITIES as [string, ...string[]]).default("public"),
  placeName: optionalText(120),
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

/** Turn a ZodError into per-field i18n keys (falls back to "invalidInput"). */
export function toFieldErrors(error: z.ZodError): FormState["fieldErrors"] {
  const out: Record<string, ErrorKey> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (out[field]) continue;
    const msg = issue.message as ErrorKey;
    out[field] = ["weakPassword"].includes(msg) ? msg : "invalidInput";
  }
  return out;
}
