import "server-only";

/**
 * Email sending. Picks a provider from the environment:
 *   - RESEND_API_KEY set: Resend's HTTP API (https://resend.com), no SDK needed.
 *     Also needs EMAIL_FROM, a sender on a domain verified in Resend.
 *   - otherwise MAILPIT_URL set: the local Mailpit inbox that `supabase start`
 *     runs (http://127.0.0.1:54324), for development and tests.
 *   - otherwise: not configured. Deliveries are marked skipped, not retried.
 */

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  /** Makes retries safe: the provider won't send the same key twice. */
  idempotencyKey?: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

export const EMAIL_NOT_CONFIGURED = "not configured";

export function emailProviderName(): "resend" | "mailpit" | null {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.MAILPIT_URL) return "mailpit";
  return null;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const provider = emailProviderName();
  try {
    if (provider === "resend") return await sendWithResend(email);
    if (provider === "mailpit") return await sendWithMailpit(email);
    return { ok: false, error: EMAIL_NOT_CONFIGURED };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "send failed" };
  }
}

async function sendWithResend(email: OutgoingEmail): Promise<SendResult> {
  const from = process.env.EMAIL_FROM;
  if (!from) return { ok: false, error: EMAIL_NOT_CONFIGURED };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text, headers: email.headers }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return { ok: true };
  // Resend returns {name, message}; keep it short and free of the address.
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return { ok: false, error: `resend ${res.status}: ${body?.message ?? res.statusText}`.slice(0, 300) };
}

async function sendWithMailpit(email: OutgoingEmail): Promise<SendResult> {
  const from = process.env.EMAIL_FROM ?? "notifications@localhost";
  const match = /^(.*)<(.+)>$/.exec(from.trim());
  const res = await fetch(`${process.env.MAILPIT_URL}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: match ? { Name: match[1].trim(), Email: match[2] } : { Email: from },
      To: [{ Email: email.to }],
      Subject: email.subject,
      HTML: email.html,
      Text: email.text,
      Headers: email.headers,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok ? { ok: true } : { ok: false, error: `mailpit ${res.status}` };
}

/** Escape text for HTML. Names, group names and captions are user-written. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/**
 * A plain, readable email layout: inline styles only (email clients ignore
 * stylesheets), one call-to-action button, and a footer with unsubscribe links.
 */
export function emailLayout({
  appName,
  bodyHtml,
  footerHtml,
}: {
  appName: string;
  bodyHtml: string;
  footerHtml: string;
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="font-weight:600;font-size:16px;margin:0 0 16px">${escapeHtml(appName)}</p>
<div style="background:#ffffff;border-radius:12px;padding:24px;font-size:16px;line-height:1.5">${bodyHtml}</div>
<div style="font-size:12px;line-height:1.5;color:#78716c;padding:16px 4px">${footerHtml}</div>
</div></body></html>`;
}

export function emailButton(label: string, href: string): string {
  return `<p style="margin:20px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(label)}</a></p>`;
}
