/**
 * Place lookup for map markers, server-side via OpenStreetMap Nominatim.
 * No key and no billing. Requests are cached and spaced to respect the
 * public usage policy of at most one request per second.
 */
import { parseUiSpec } from "@bluebird/shared";

export type GeoPoint = { lat: number; lng: number };
export type Geocoder = { lookup(query: string): Promise<GeoPoint | null> };

const CACHE_LIMIT = 500;
const GEOCODE_BUDGET_MS = 6_000;
const LOOKUP_BUDGET_MS = 2_500;

export function createNominatimGeocoder(): Geocoder {
  const cache = new Map<string, GeoPoint | null>();
  let queue: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  return {
    async lookup(query: string) {
      const key = query.trim().toLowerCase();
      if (!key) return null;
      if (cache.has(key)) return cache.get(key) ?? null;
      const task = queue.then(async () => {
        const wait = Math.max(0, 1100 - (Date.now() - lastAt));
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        lastAt = Date.now();
        try {
          const url = new URL("https://nominatim.openstreetmap.org/search");
          url.searchParams.set("q", query.slice(0, 120));
          url.searchParams.set("format", "jsonv2");
          url.searchParams.set("limit", "1");
          const response = await fetch(url, {
            headers: {
              "User-Agent": "BluebirdHarness/1.0",
              "Accept-Language": "en",
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) return null;
          const data = (await response.json()) as { lat?: string; lon?: string }[];
          const first = data?.[0];
          const lat = Number(first?.lat);
          const lng = Number(first?.lon);
          return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        } catch {
          return null;
        }
      });
      queue = task.then(
        () => undefined,
        () => undefined,
      );
      const result = await task;
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key, result);
      return result;
    },
  };
}

/** A lookup that never holds the reply open past the remaining budget. */
function lookupWithBudget(
  geocoder: Geocoder,
  query: string,
  budgetMs: number,
): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, budgetMs);
    void geocoder.lookup(query).then(
      (point) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(point);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * Fills coordinates for map markers that only name a place. Only touches a
 * reply that already contains a ui fence, and only when a marker needs it.
 * The whole pass is best-effort and time-boxed: a slow public geocoder must
 * never delay the finished reply.
 */
export async function resolveMapCoordinates(
  text: string,
  geocoder: Geocoder | null,
  budgetMs = GEOCODE_BUDGET_MS,
): Promise<string> {
  if (!geocoder || !text.includes("```ui")) return text;
  const match = text.match(/(```ui\n)([\s\S]*?)(\n```)/);
  if (!match) return text;
  const spec = parseUiSpec(match[2]);
  if (!spec) return text;
  let changed = false;
  const deadline = Date.now() + budgetMs;
  for (const block of spec.blocks) {
    if (block.type !== "map") continue;
    for (const marker of block.markers) {
      if (typeof marker.lat === "number" && typeof marker.lng === "number") continue;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const query = marker.q?.trim() || marker.label;
      const point = await lookupWithBudget(
        geocoder,
        query,
        Math.min(remaining, LOOKUP_BUDGET_MS),
      );
      if (point) {
        marker.lat = point.lat;
        marker.lng = point.lng;
        changed = true;
      }
    }
  }
  if (!changed) return text;
  return text.replace(match[0], `${match[1]}${JSON.stringify(spec)}${match[3]}`);
}
