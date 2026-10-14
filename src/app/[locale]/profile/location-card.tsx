"use client";

import { useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveMyLocation } from "@/lib/actions/profile";
import type { Messages } from "@/i18n/messages/en";

type Props = { hasLocation: boolean; t: Pick<Messages, "profile" | "errors"> };

/**
 * Asks the browser for the user's position and saves it privately.
 * The coordinates are sent once to the server and never displayed or returned.
 */
export function LocationCard({ hasLocation, t }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function share() {
    if (!("geolocation" in navigator)) {
      setMessage(t.profile.locationUnsupported);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        startTransition(async () => {
          const result = await saveMyLocation(coords.latitude, coords.longitude);
          setMessage(result.ok ? t.profile.locationSaved : t.errors[result.error ?? "generic"]);
        }),
      () => setMessage(t.profile.locationDenied),
      // City-level accuracy is plenty for matching and saves battery.
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 15_000 },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin aria-hidden /> {t.profile.locationTitle}
        </CardTitle>
        <CardDescription>{t.profile.locationBody}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={share} disabled={pending}>
          {hasLocation ? t.profile.locationUpdate : t.profile.locationShare}
        </Button>
        <p role="status" className="text-muted-foreground text-sm">
          {message ?? (hasLocation ? t.profile.locationSaved : t.profile.locationNone)}
        </p>
      </CardContent>
    </Card>
  );
}
