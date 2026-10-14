import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * GDPR data export: everything we hold about the signed-in person, as a JSON
 * download. export_my_data() (migration 0009) only ever returns the caller's
 * own data; export_my_notification_data() (0010) adds notifications.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const supabase = await createClient();
  const [{ data: core, error }, { data: notifications, error: notificationsError }] = await Promise.all([
    supabase.rpc("export_my_data"),
    supabase.rpc("export_my_notification_data"),
  ]);
  if (error || notificationsError) return NextResponse.json({ error: "export failed" }, { status: 500 });
  // Notification data (migration 0010) is exported separately and merged here.
  const data = { ...(core as Record<string, unknown>), ...(notifications as Record<string, unknown>) };
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
