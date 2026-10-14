import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * RFC 8058 one-click unsubscribe: mail apps POST here from the
 * List-Unsubscribe header. The token in the link is the only key needed.
 * People who click the link in the email body get the confirmation page at
 * /[locale]/unsubscribe instead, so link scanners can't unsubscribe anyone.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const type = request.nextUrl.searchParams.get("type");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ ok: false }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_email", { p_token: token, p_type: type });
  if (error || !data) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true });
}
