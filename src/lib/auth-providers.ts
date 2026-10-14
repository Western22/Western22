/**
 * OAuth providers shown on the sign-in page. A provider appears only when it
 * is listed in NEXT_PUBLIC_AUTH_PROVIDERS (comma-separated, e.g. "google,apple")
 * because each one must first be configured in the Supabase dashboard.
 */
export const OAUTH_PROVIDERS = ["google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function getEnabledProviders(): OAuthProvider[] {
  const raw = process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "";
  const wanted = raw.split(",").map((p) => p.trim().toLowerCase());
  return OAUTH_PROVIDERS.filter((p) => wanted.includes(p));
}

/** Short-lived cookie carrying the 18+ checkbox across the OAuth/email round trip. */
export const ADULT_COOKIE = "adult_ok";
