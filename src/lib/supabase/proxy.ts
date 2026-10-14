import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Refresh the Supabase session on every request and return a response that
 * carries any updated auth cookies. This is only an optimistic session
 * refresh; real authorization happens in the data layer and in Postgres RLS.
 */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const { url, key } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Update the request so Server Components in this same request see the
        // refreshed session, then rebuild the response from it.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Prevent CDNs from caching a response that carries someone's session.
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Validates the JWT (and refreshes it if expired). Do not remove.
  await supabase.auth.getClaims();
  return response;
}
