// Approximate locations for public views (D-025). Every public point is snapped to a grid of
// PUBLIC_GRID_DEG degrees (about 220 m north–south, 210 m east–west in Sangli), so a public pin is
// at most about 150 m from the real spot. The exact point never leaves the server in a public view.
// All SQL is parameterised (Prisma.sql tagged templates).
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.ts";

export const PUBLIC_GRID_DEG = 0.002;
/** Radius drawn around an approximate pin in the web app (covers the snapping error). */
export const APPROX_RADIUS_M = 150;
export const MAP_PIN_LIMIT = 300;

const snapped = Prisma.sql`ST_SnapToGrid(location::geometry, ${PUBLIC_GRID_DEG}, ${PUBLIC_GRID_DEG})`;
const ids = (list) => Prisma.join(list.map((id) => Prisma.sql`${id}::uuid`));
// Rounding removes floating-point noise from the snapped value (e.g. 16.852000000000004).
const round = (n) => Math.round(n * 1e6) / 1e6;

/** Snap a plain point the same way (for the area-name lookup and tests). */
export function snapPoint({ lat, lng }) {
  const snap = (v) => round(Math.round(v / PUBLIC_GRID_DEG) * PUBLIC_GRID_DEG);
  return { lat: snap(lat), lng: snap(lng) };
}

/** { issueId → { lat, lng } } snapped to the public grid. */
export async function approximateLocations(db, issueIds) {
  if (!issueIds.length) return {};
  const rows = await db.$queryRaw`
    SELECT id::text AS id, ST_Y(${snapped}) AS lat, ST_X(${snapped}) AS lng
    FROM issues WHERE id IN (${ids(issueIds)})`;
  return Object.fromEntries(rows.map((r) => [r.id, { lat: round(r.lat), lng: round(r.lng) }]));
}

export const bboxSchema = z
  .object({ minLng: z.number().min(-180).max(180), minLat: z.number().min(-90).max(90), maxLng: z.number().min(-180).max(180), maxLat: z.number().min(-90).max(90) })
  .refine((b) => b.minLng < b.maxLng && b.minLat < b.maxLat, "min must be below max");

/**
 * Ids and snapped points of the issues among `candidateSql` whose SNAPPED point is inside the box,
 * newest first, at most `limit`. Filtering on the snapped point (not the exact one) means moving the
 * box edge can never reveal where the exact point is.
 * @param {Prisma.Sql} publicFilter SQL condition on `issues` (the D-022 public rule and filters)
 */
export async function pinsInBox(db, { bbox, publicFilter, limit = MAP_PIN_LIMIT }) {
  const b = bboxSchema.parse(bbox);
  const pad = PUBLIC_GRID_DEG; // the index pre-filter uses the exact point, so widen it by one cell
  const rows = await db.$queryRaw`
    SELECT id::text AS id, ST_Y(${snapped}) AS lat, ST_X(${snapped}) AS lng
    FROM issues
    WHERE location && ST_MakeEnvelope(${b.minLng - pad}, ${b.minLat - pad}, ${b.maxLng + pad}, ${b.maxLat + pad}, 4326)::geography
      AND ST_Intersects(${snapped}, ST_MakeEnvelope(${b.minLng}, ${b.minLat}, ${b.maxLng}, ${b.maxLat}, 4326))
      AND ${publicFilter}
    ORDER BY created_at DESC, id
    LIMIT ${limit + 1}`;
  return {
    pins: rows.slice(0, limit).map((r) => ({ id: r.id, lat: round(r.lat), lng: round(r.lng) })),
    truncated: rows.length > limit,
  };
}
