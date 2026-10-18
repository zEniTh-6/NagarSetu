// Geo helpers. All geo SQL lives in src/geo/ and is parameterised (Prisma.sql tagged templates):
// values are always sent as bind parameters, never concatenated into the SQL string.
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.ts";

export const latLngSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

/** SQL fragment for a WGS84 geography point. Note PostGIS order is (lng, lat). */
export function pointGeography(point) {
  const { lat, lng } = latLngSchema.parse(point);
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}

/**
 * Ids of issues whose location is within radiusM metres of a point (uses the GiST index).
 * Later phases add category / active-status / text-similarity filters for the duplicate check.
 */
export async function issueIdsWithinRadius(db, { lat, lng, radiusM }) {
  const radius = z.number().positive().max(50_000).parse(radiusM);
  const rows = await db.$queryRaw`
    SELECT id::text AS id
    FROM issues
    WHERE ST_DWithin(location, ${pointGeography({ lat, lng })}, ${radius})
    ORDER BY ST_Distance(location, ${pointGeography({ lat, lng })})`;
  return rows.map((r) => r.id);
}
