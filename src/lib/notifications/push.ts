import "server-only";
import webpush, { WebPushError } from "web-push";

/** What the service worker (public/sw.js) shows. `url` is a path on this site. */
export type PushPayload = { title: string; body: string; url: string; tag: string };

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** `gone` = the browser vendor says this subscription no longer exists; delete it. */
export type PushResult = { ok: boolean; gone?: boolean; error?: string };

/** Public half of the VAPID key pair, for the browser's subscribe() call. */
export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export function pushConfigured(): boolean {
  return Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

/**
 * Send one web push message with the web-push library, which encrypts the
 * payload for the browser (RFC 8291) and signs the request with our VAPID key
 * (RFC 8292). Generate keys once with `npx web-push generate-vapid-keys`.
 * Without keys every push reports "not configured" and is skipped, not retried.
 */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  if (!pushConfigured()) return { ok: false, error: "not configured" };
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT as string,
          publicKey: vapidPublicKey() as string,
          privateKey: process.env.VAPID_PRIVATE_KEY as string,
        },
        // Drop it if the device stays offline for a day; old news isn't worth showing.
        TTL: 24 * 60 * 60,
        urgency: "normal",
        timeout: 10_000,
      },
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof WebPushError) {
      // 404/410: the subscription was revoked or expired.
      const gone = error.statusCode === 404 || error.statusCode === 410;
      return { ok: false, gone, error: `push ${error.statusCode}` };
    }
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "push failed" };
  }
}
