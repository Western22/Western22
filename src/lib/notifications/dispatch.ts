import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DigestData, NotificationDeliveryRow } from "@/lib/supabase/database.types";
import { isLocale, defaultLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/en";
import { renderNotification } from "./render";
import { EMAIL_NOT_CONFIGURED, emailButton, emailLayout, escapeHtml, sendEmail, type OutgoingEmail } from "./email";
import { sendPush, type PushPayload } from "./push";

/**
 * One run of the notification sender, called by /api/cron/notifications:
 *   1. queue scheduled notifications (date reminders, weekly digests);
 *   2. claim due email/push deliveries (the database applies batching,
 *      preferences, read state and quiet hours);
 *   3. send each one and report back, so failures retry and dead push
 *      endpoints are removed.
 * Safe to run often and concurrently: claims use SKIP LOCKED.
 */
export async function runNotificationDispatch({ batchSize = 100 }: { batchSize?: number } = {}) {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set");

  const { data: scheduled, error: scheduleError } = await admin.rpc("queue_scheduled_notifications");
  if (scheduleError) throw new Error(`queue_scheduled_notifications: ${scheduleError.message}`);

  const { data: deliveries, error } = await admin.rpc("claim_notification_deliveries", { p_limit: batchSize });
  if (error) throw new Error(`claim_notification_deliveries: ${error.message}`);

  const summary = { scheduled, claimed: deliveries.length, sent: 0, failed: 0, skipped: 0 };
  const siteUrl = siteBaseUrl();

  for (const d of deliveries) {
    const t = await getMessages(isLocale(d.locale) ? d.locale : defaultLocale);
    const locale = isLocale(d.locale) ? d.locale : defaultLocale;
    let ok = false;
    let errorText: string | null = null;
    let expired: string[] | null = null;

    try {
      if (d.channel === "email") {
        const email = buildEmail(d, t, locale, siteUrl);
        if (!email) {
          errorText = "no email address";
        } else {
          const result = await sendEmail(email);
          ok = result.ok;
          if (!result.ok) errorText = result.error;
        }
      } else {
        const payload = buildPush(d, t, locale);
        const results = await Promise.all((d.push_subscriptions ?? []).map((s) => sendPush(s, payload)));
        expired = (d.push_subscriptions ?? []).filter((_, i) => results[i].gone).map((s) => s.endpoint);
        ok = results.some((r) => r.ok);
        if (!ok) errorText = results.find((r) => r.error)?.error ?? "no device accepted it";
      }
    } catch (e) {
      errorText = e instanceof Error ? e.message : "send failed";
    }

    await admin.rpc("finish_notification_delivery", {
      p_delivery_id: d.delivery_id,
      p_ok: ok,
      p_error: errorText,
      p_expired_endpoints: expired && expired.length > 0 ? expired : null,
    });
    if (ok) summary.sent++;
    else if (errorText === EMAIL_NOT_CONFIGURED) summary.skipped++;
    else summary.failed++;
  }
  return summary;
}

/** Absolute base for links in emails and push. Falls back to localhost in development. */
function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function unsubscribeLinks(d: NotificationDeliveryRow, siteUrl: string, locale: string) {
  const token = d.unsubscribe_token ?? "";
  const q = (type: string) => `token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`;
  return {
    // RFC 8058 one-click: mail apps POST here directly.
    oneClick: `${siteUrl}/api/unsubscribe?${q(d.type)}`,
    pageType: `${siteUrl}/${locale}/unsubscribe?${q(d.type)}`,
    pageAll: `${siteUrl}/${locale}/unsubscribe?${q("all")}`,
    settings: `${siteUrl}/${locale}/settings#notifications`,
  };
}

function emailFooter(t: Messages, links: ReturnType<typeof unsubscribeLinks>, why: string) {
  const nt = t.notifications.email;
  const a = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="color:#78716c">${escapeHtml(label)}</a>`;
  return {
    html: `${escapeHtml(why)}<br>${a(links.pageType, nt.unsubscribeType)} · ${a(links.pageAll, nt.unsubscribeAll)} · ${a(links.settings, nt.manage)}`,
    text: `${why}\n${nt.unsubscribeType}: ${links.pageType}\n${nt.unsubscribeAll}: ${links.pageAll}\n${nt.manage}: ${links.settings}`,
  };
}

function buildEmail(d: NotificationDeliveryRow, t: Messages, locale: string, siteUrl: string): OutgoingEmail | null {
  if (!d.email) return null;
  const links = unsubscribeLinks(d, siteUrl, locale);
  const headers = {
    "List-Unsubscribe": `<${links.oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  const appName = t.app.name;

  if (d.type === "weekly_digest") {
    const digest = d.data as DigestData;
    const dt = t.notifications.digest;
    const footer = emailFooter(t, links, dt.why);
    const matchLines = (digest.matches ?? []).map((m) => ({
      text: format(dt.matchLine, { name: m.name, goal: m.goal }),
      href: `${siteUrl}/${locale}/items/${m.item_id}/matches`,
    }));
    const more = (digest.match_count ?? 0) - matchLines.length;
    const storyLines = (digest.stories ?? []).map((s) => ({
      text: format(dt.storyLine, { name: s.name, goal: s.goal }),
      caption: s.caption,
      reactions: format(dt.reactions, { count: s.reactions }),
      href: `${siteUrl}/${locale}/stories/${s.id}`,
    }));
    const list = (items: string[]) => `<ul style="padding-left:20px;margin:8px 0 16px">${items.join("")}</ul>`;
    const html = [
      `<p style="margin:0 0 16px">${escapeHtml(dt.intro)}</p>`,
      matchLines.length > 0
        ? `<p style="font-weight:600;margin:0">${escapeHtml(dt.matchesTitle)}</p>` +
          list(matchLines.map((m) => `<li><a href="${escapeHtml(m.href)}" style="color:#1c1917">${escapeHtml(m.text)}</a></li>`)) +
          (more > 0 ? `<p style="margin:-8px 0 16px;color:#78716c">${escapeHtml(format(dt.moreMatches, { count: more }))}</p>` : "")
        : "",
      storyLines.length > 0
        ? `<p style="font-weight:600;margin:0">${escapeHtml(dt.storiesTitle)}</p>` +
          list(
            storyLines.map(
              (s) =>
                `<li style="margin-bottom:8px"><a href="${escapeHtml(s.href)}" style="color:#1c1917">${escapeHtml(s.text)}</a><br>` +
                `<span style="color:#57534e">${escapeHtml(s.caption)}</span> <span style="color:#78716c">· ${escapeHtml(s.reactions)}</span></li>`,
            ),
          )
        : "",
      emailButton(format(dt.cta, { app: appName }), `${siteUrl}/${locale}`),
    ].join("");
    const text = [
      dt.intro,
      ...(matchLines.length > 0 ? ["", dt.matchesTitle, ...matchLines.map((m) => `- ${m.text}: ${m.href}`)] : []),
      ...(more > 0 ? [format(dt.moreMatches, { count: more })] : []),
      ...(storyLines.length > 0 ? ["", dt.storiesTitle, ...storyLines.map((s) => `- ${s.text}: ${s.href}`)] : []),
      "",
      `${siteUrl}/${locale}`,
      "",
      footer.text,
    ].join("\n");
    return {
      to: d.email,
      subject: dt.subject,
      html: emailLayout({ appName, bodyHtml: html, footerHtml: footer.html }),
      text,
      headers,
      idempotencyKey: `delivery-${d.delivery_id}`,
    };
  }

  const r = renderNotification({ ...d, type: d.type }, t.notifications, locale);
  const href = `${siteUrl}${r.path}`;
  const footer = emailFooter(t, links, t.notifications.email.why);
  return {
    to: d.email,
    subject: r.text,
    html: emailLayout({
      appName,
      bodyHtml: `<p style="margin:0">${escapeHtml(r.text)}</p>${emailButton(r.action, href)}`,
      footerHtml: footer.html,
    }),
    text: `${r.text}\n\n${r.action}: ${href}\n\n${footer.text}`,
    headers,
    idempotencyKey: `delivery-${d.delivery_id}`,
  };
}

function buildPush(d: NotificationDeliveryRow, t: Messages, locale: string): PushPayload {
  if (d.type === "weekly_digest") {
    // Digests are email-only; this is just a safe fallback.
    return { title: t.app.name, body: t.notifications.digest.subject, url: `/${locale}`, tag: "weekly_digest" };
  }
  const r = renderNotification({ ...d, type: d.type }, t.notifications, locale);
  // The tag makes a newer batch replace the older one on the device.
  const tag = d.group_id ? `${d.type}:${d.group_id}` : d.story_id ? `${d.type}:${d.story_id}` : d.type;
  return { title: t.app.name, body: r.text, url: r.path, tag };
}
