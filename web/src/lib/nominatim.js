// Address search with Nominatim (OpenStreetMap). Usage policy: at most 1 request per second, no
// as-you-type search. Callers only search on Enter / button press; this module also spaces requests.
import { SERVICE_AREA } from "./serviceArea.js";

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
export const MIN_INTERVAL_MS = 1000;

let nextSlot = 0;

/** Waits until at least MIN_INTERVAL_MS has passed since the previous request started. */
async function takeSlot(now = Date.now) {
  const t = now();
  const wait = Math.max(0, nextSlot - t);
  nextSlot = Math.max(t, nextSlot) + MIN_INTERVAL_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

/** Test helper. */
export function resetNominatimThrottle() {
  nextSlot = 0;
}

/**
 * Places inside the service area matching `query`.
 * @returns {Promise<{ label: string, lat: number, lng: number }[]>}
 */
export async function searchPlaces(query, { lang = "en", signal } = {}) {
  const q = query.trim();
  if (q.length < 3) return [];
  await takeSlot();
  const { minLng, minLat, maxLng, maxLat } = SERVICE_AREA;
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "5",
    countrycodes: "in",
    bounded: "1",
    viewbox: `${minLng},${maxLat},${maxLng},${minLat}`,
    "accept-language": lang,
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = await res.json();
  return rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}
