// Which issues are public (D-022): the photo check said VALID, or the department admin
// acknowledged the report; and the issue is open or resolved. Rejected, withdrawn and linked
// duplicates are never public. Until then only the reporter, supporters and the admin see it.
import { Prisma } from "../../generated/prisma/client.ts";

export const PUBLIC_STATUSES = ["REPORTED", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"];

/** Prisma `where` for public issues. */
export const publicWhere = (extra = {}) => ({
  status: { in: PUBLIC_STATUSES },
  OR: [{ aiVerdict: "VALID" }, { acknowledgedAt: { not: null } }],
  ...extra,
});

/** The same rule as a SQL condition on the `issues` table (for the raw map query). */
export function publicSql({ categoryId } = {}) {
  const statuses = Prisma.join(PUBLIC_STATUSES);
  return Prisma.sql`status::text IN (${statuses})
    AND (ai_verdict::text = 'VALID' OR acknowledged_at IS NOT NULL)
    ${categoryId ? Prisma.sql`AND category_id = ${categoryId}::uuid` : Prisma.empty}`;
}

export const isPublic = (issue) => PUBLIC_STATUSES.includes(issue.status) && (issue.aiVerdict === "VALID" || Boolean(issue.acknowledgedAt));
