"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { deletePushSubscription, savePushSubscription } from "@/lib/actions/notifications";
import type { Messages } from "@/i18n/messages/en";

type Status = "loading" | "unsupported" | "notConfigured" | "denied" | "on" | "off";

/** VAPID keys are base64url; subscribe() wants raw bytes. */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Turn web push on or off for this browser. Registers /sw.js, asks the
 * browser for permission only when the person taps the button, and stores the
 * subscription so the server can reach this device.
 */
export function PushToggle({ vapidPublicKey, t }: { vapidPublicKey: string | null; t: Messages["notifications"]["settings"]["push"] }) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setStatus("unsupported");
      if (!vapidPublicKey) return setStatus("notConfigured");
      if (Notification.permission === "denied") return setStatus("denied");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setStatus(existing ? "on" : "off");
    })().catch(() => !cancelled && setStatus("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(vapidPublicKey),
      });
      const { ok } = await savePushSubscription(subscription.toJSON());
      if (!ok) {
        await subscription.unsubscribe();
        return setStatus("off");
      }
      setStatus("on");
    } catch {
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return null;
  const message =
    status === "on" ? t.on : status === "off" ? t.off : status === "denied" ? t.denied : status === "notConfigured" ? t.notConfigured : t.unsupported;

  return (
    <div className="flex flex-col items-start gap-2 text-sm" data-testid="push-toggle">
      <p role="status" className="text-muted-foreground">
        {message}
      </p>
      {status === "off" && (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={enable}>
          {t.enable}
        </Button>
      )}
      {status === "on" && (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={disable}>
          {t.disable}
        </Button>
      )}
    </div>
  );
}
