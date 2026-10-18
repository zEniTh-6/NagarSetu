// Duplicate search: same category + active + within the category's radius (PostGIS)
// + text similarity at or above the threshold (pgvector). All parameterised.
// Vectors are passed as a text parameter '[0.1,0.2,…]' and cast to ::vector in SQL.
import { Prisma } from "../generated/prisma/client.ts";
import { pointGeography } from "./point.js";

export const ACTIVE_STATUSES = ["REPORTED", "ACKNOWLEDGED", "IN_PROGRESS"];

export const vectorLiteral = (values) => {
  if (!Array.isArray(values) || values.some((v) => !Number.isFinite(v))) throw new Error("Invalid vector");
  return `[${values.join(",")}]`;
};

export async function setIssueEmbedding(db, issueId, values, model, now = new Date()) {
  await db.$executeRaw`
    UPDATE issues
    SET embedding = ${vectorLiteral(values)}::vector, embedding_model = ${model}, embedded_at = ${now},
        embedding_attempts = embedding_attempts + 1
    WHERE id = ${issueId}::uuid`;
}

/** The stored embedding of one issue, or null. */
export async function getIssueEmbedding(db, issueId) {
  const rows = await db.$queryRaw`SELECT embedding::text AS v FROM issues WHERE id = ${issueId}::uuid AND embedding IS NOT NULL`;
  return rows.length ? JSON.parse(rows[0].v) : null;
}

/**
 * @returns {Promise<Array<{ id, description, status, createdAt, distanceM, similarity }>>}
 *   best matches first; at most `limit`.
 */
export async function findDuplicateCandidates(db, { categoryId, lat, lng, radiusM, embedding, threshold, excludeIssueId = null, limit = 5 }) {
  const pin = pointGeography({ lat, lng });
  const vec = Prisma.sql`${vectorLiteral(embedding)}::vector`;
  return db.$queryRaw`
    SELECT id::text AS id, description, status::text AS status, created_at AS "createdAt",
           ST_Distance(location, ${pin}) AS "distanceM",
           1 - (embedding <=> ${vec}) AS similarity
    FROM issues
    WHERE category_id = ${categoryId}::uuid
      AND status::text IN (${Prisma.join(ACTIVE_STATUSES)})
      AND embedding IS NOT NULL
      AND ST_DWithin(location, ${pin}, ${radiusM})
      AND (${excludeIssueId}::uuid IS NULL OR id <> ${excludeIssueId}::uuid)
      AND 1 - (embedding <=> ${vec}) >= ${threshold}
    ORDER BY similarity DESC, "distanceM" ASC
    LIMIT ${limit}`;
}
