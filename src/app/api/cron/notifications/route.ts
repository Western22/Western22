import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runNotificationDispatch } from "@/lib/notifications/dispatch";

/**
 * The notification sender. Call it every minute or few (Vercel Cron, Supabase
 * pg_cron + pg_net, or any scheduler) with `Authorization: Bearer $CRON_SECRET`.
 * It queues date reminders and weekly digests, then sends due email and push.
 * GET is accepted because Vercel Cron uses GET.
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
    const summary = await runNotificationDispatch();
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("notification dispatch failed", error);
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
