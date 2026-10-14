import "server-only";
import { headers } from "next/headers";

/**
 * Absolute base URL for links Supabase emails out (confirmation, magic links).
 * Prefer the configured NEXT_PUBLIC_SITE_URL in production; the request Origin
 * is a fallback for local development.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
