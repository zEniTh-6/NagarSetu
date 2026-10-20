// Neighbourhood name for a point, from Nominatim reverse geocoding (OpenStreetMap). The rest of the
// app only sees `lookupAreaName({ lat, lng })`, so the provider can be swapped.
// Usage policy: at most 1 request per second and a User-Agent that identifies the app. Callers
// always pass the APPROXIMATE (snapped) point, never the exact one (D-025).
import { env } from "../config/env.js";

export const MIN_INTERVAL_MS = 1100; // a little over 1 s, to stay under Nominatim's 1 req/s
const MAX_NAME = 120;
// Most specific first. zoom=14 asks Nominatim for suburb level, so street/house fields are not used.
const NAME_FIELDS = ["neighbourhood", "suburb", "quarter", "city_district", "village", "town", "city"];

export class AreaLookupError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AreaLookupError";
    this.cause = cause;
  }
}

/** Picks a short area name from a Nominatim `address` object (null when there is none). */
export function pickAreaName(address) {
  for (const field of NAME_FIELDS) {
    const v = typeof address?.[field] === "string" ? address[field].trim() : "";
    if (v) return v.slice(0, MAX_NAME);
  }
  return null;
}

/** Spaces calls at least `intervalMs` apart within this process (one queue for everyone). */
export function createThrottle(intervalMs = MIN_INTERVAL_MS, { now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let next = 0;
  let chain = Promise.resolve();
  return (fn) => {
    const run = chain.then(async () => {
      const wait = next - now();
      if (wait > 0) await sleep(wait);
      next = now() + intervalMs;
      return fn();
    });
    chain = run.catch(() => {});
    return run;
  };
}

/**
 * @returns {(point: {lat:number, lng:number}) => Promise<string|null>}
 *   the name, or null when Nominatim has none. Throws AreaLookupError on network/HTTP failure.
 */
export function createAreaLookup({ baseUrl = env.NOMINATIM_URL, userAgent = env.NOMINATIM_USER_AGENT, timeoutMs = env.AREA_LOOKUP_TIMEOUT_MS, fetchImpl = fetch, throttle = createThrottle() } = {}) {
  return ({ lat, lng }) =>
    throttle(async () => {
      const url = new URL("/reverse", baseUrl);
      url.search = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "14", addressdetails: "1", "accept-language": "en" }).toString();
      let res;
      try {
        res = await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        throw new AreaLookupError(`Nominatim request failed: ${err.message}`, err);
      }
      if (!res.ok) throw new AreaLookupError(`Nominatim answered HTTP ${res.status}`);
      let body;
      try {
        body = await res.json();
      } catch (err) {
        throw new AreaLookupError("Nominatim sent an unreadable answer", err);
      }
      return body?.error ? null : pickAreaName(body?.address);
    });
}

export const lookupAreaName = createAreaLookup();
