import "server-only";

/**
 * Hook for ID verification (the tier above phone). Nothing implements it yet.
 *
 * TODO(id-verification): wire a provider such as Stripe Identity (paid; ask
 * before adding). The flow would be:
 *   1. startSession() creates a provider verification session for the signed-in
 *      user and returns the provider's hosted URL.
 *   2. The provider calls a webhook route (to add: src/app/api/verification/id/route.ts),
 *      which verifies the provider's signature and calls
 *      `select public.set_id_verified(user_id, true)` with the service-role
 *      client (src/lib/supabase/admin.ts).
 *   3. profiles.id_verified_at is set and the profile badge shows "ID verified".
 * Store no document images or ID numbers here; keep them with the provider.
 */
export interface IdVerificationProvider {
  readonly name: string;
  startSession(userId: string, returnUrl: string): Promise<{ url: string }>;
}

/** The configured provider, or null while none is set up (the UI then hides ID verification). */
export function idVerificationProvider(): IdVerificationProvider | null {
  return null;
}
