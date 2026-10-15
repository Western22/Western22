import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Throws on purpose so you can check Sentry receives server errors after a
 * deploy (launch checklist). Needs `Authorization: Bearer $CRON_SECRET`, so
 * nobody else can fill your error quota.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  throw new Error("Sentry test error (sent on purpose from /api/monitoring/test-error)");
}
