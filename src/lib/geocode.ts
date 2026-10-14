import "server-only";
import { z } from "zod";

/**
 * Turn a typed home city into coordinates with OpenStreetMap Nominatim (free).
 * Runs on the server only, so the result is never sent to the browser; callers
 * pass it straight to set_my_location(), which snaps it to a ~5 km grid.
 *
 * Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * at most 1 request per second, an identifying User-Agent, and attribution.
 * We only geocode when someone saves a new home city, which stays far below that.
 * TODO(geocoding): at real scale, self-host Nominatim or switch providers;
 * point NOMINATIM_URL at it, no code change needed.
 */

const DEFAULT_URL = "https://nominatim.openstreetmap.org";
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 5000;

const resultSchema = z.array(z.object({ lat: z.coerce.number(), lon: z.coerce.number() }));

// Per-server-instance throttle: each call waits for the previous one plus the interval.
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

export type Coordinates = { lat: number; lng: number };

/**
 * Coordinates for a city, or null when it can't be found or the service fails.
 * A failure never blocks saving the profile; the city label is still stored.
 */
export async function geocodeCity(city: string, country: string | null, locale: string): Promise<Coordinates | null> {
  const name = city.trim();
  if (name.length < 2) return null;

  const base = (process.env.NOMINATIM_URL || DEFAULT_URL).replace(/\/$/, "");
  const params = new URLSearchParams({ city: name, format: "jsonv2", limit: "1", "accept-language": locale });
  if (country) params.set("countrycodes", country.toLowerCase());
  const contact = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    return await throttled(async () => {
      const res = await fetch(`${base}/search?${params}`, {
        headers: { "User-Agent": `Buddies/0.1 (${contact})` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const parsed = resultSchema.safeParse(await res.json());
      if (!parsed.success || parsed.data.length === 0) return null;
      const { lat, lon } = parsed.data[0];
      return { lat, lng: lon };
    });
  } catch {
    return null;
  }
}
