// Issue rows with a location. Issues must be inserted with raw SQL because `location` is an
// Unsupported(geography) column. Everything here is parameterised (Prisma.sql tagged templates).
import { Prisma } from "../generated/prisma/client.ts";
import { pointGeography } from "./point.js";

/**
 * Inserts an issue unless this reporter already sent the same clientRequestId.
 * Returns { id, gpsDistanceM, created } — created=false means it was a retry of an earlier request.
 */
export async function insertIssue(db, i) {
  const pin = pointGeography({ lat: i.lat, lng: i.lng });
  const hasDevice = i.deviceLat != null && i.deviceLng != null;
  const device = hasDevice ? pointGeography({ lat: i.deviceLat, lng: i.deviceLng }) : null;

  const rows = await db.$queryRaw`
    INSERT INTO issues (
      id, reporter_id, client_request_id, category_id, department_id, description,
      location, address_text, device_lat, device_lng, device_accuracy_m, gps_distance_m, updated_at
    ) VALUES (
      ${i.id}::uuid, ${i.reporterId}::uuid, ${i.clientRequestId}, ${i.categoryId}::uuid, ${i.departmentId}::uuid,
      ${i.description}, ${pin}, ${i.addressText ?? null},
      ${hasDevice ? i.deviceLat : null}, ${hasDevice ? i.deviceLng : null}, ${hasDevice ? (i.deviceAccuracyM ?? null) : null},
      ${hasDevice ? Prisma.sql`ST_Distance(${pin}, ${device})` : Prisma.sql`NULL`},
      now()
    )
    ON CONFLICT (reporter_id, client_request_id) DO NOTHING
    RETURNING id::text AS id, gps_distance_m AS "gpsDistanceM"`;

  if (rows.length) return { ...rows[0], created: true };

  const existing = await db.$queryRaw`
    SELECT id::text AS id, gps_distance_m AS "gpsDistanceM"
    FROM issues WHERE reporter_id = ${i.reporterId}::uuid AND client_request_id = ${i.clientRequestId}`;
  return { ...existing[0], created: false };
}

/** { issueId → { lat, lng } } for the given ids. */
export async function issueLocations(db, ids) {
  if (!ids.length) return {};
  const rows = await db.$queryRaw`
    SELECT id::text AS id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM issues WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
  return Object.fromEntries(rows.map((r) => [r.id, { lat: r.lat, lng: r.lng }]));
}
