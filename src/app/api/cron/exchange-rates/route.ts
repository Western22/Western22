import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { refreshExchangeRates } from "@/lib/exchange-rates";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily housekeeping for going global: refresh exchange rates (ECB) and prune
 * old Translate-button usage rows. Schedule once a day (after 16:00 CET is when
 * the ECB publishes) with `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const rates = await refreshExchangeRates();
    await createAdminClient()?.rpc("prune_translation_usage");
    return NextResponse.json({ rates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("exchange rate refresh failed", error);
    return NextResponse.json({ error: "refresh failed" }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
