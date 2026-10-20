// Dates and numbers in the user's language (Intl). Times in tabular figures where shown.

export function formatDateTime(value, lang) {
  if (!value) return "";
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatDate(value, lang) {
  if (!value) return "";
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "2 hours ago" / "in 3 days". */
export function formatRelative(value, lang, now = Date.now()) {
  if (!value) return "";
  const diff = (new Date(value).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(0, "minute");
}

export const formatDistance = (m, lang) =>
  m >= 1000
    ? `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(m / 1000)} km`
    : `${new Intl.NumberFormat(lang).format(Math.round(m))} m`;

export const formatCoords = (lat, lng) => `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;

/** Short reference shown to citizens: first 8 characters of the UUID, upper case. */
export const shortRef = (id) => (id ? `#${id.slice(0, 8).toUpperCase()}` : "");

export function newRequestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // RFC 4122 v4 from getRandomValues (older browsers).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
