// Read-only audit log for an admin (D-026, decision B). An admin sees:
//   - every row about their department's issues, including the issues' assignments, repair
//     submissions and comments;
//   - every action by an admin of their department (e.g. contractor accounts they created or
//     deactivated, citizens they suspended).
// Other departments' rows never appear. All SQL is parameterised (Prisma.sql).
import { Prisma } from "../../generated/prisma/client.ts";
import { departmentScope } from "../../auth/scope.js";
import { AuditAction, AuditTarget } from "../../audit/actions.js";

export const AUDIT_ACTIONS = Object.values(AuditAction);
export const AUDIT_TARGETS = Object.values(AuditTarget);
export const AUDIT_ACTORS = ["ME", "ADMIN", "CITIZEN", "CONTRACTOR", "SYSTEM"];
const REF = /^#?([0-9a-f]{4,8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// The issue a row is about (null for account rows), worked out from its target.
const ISSUE_OF = Prisma.sql`COALESCE(
  CASE WHEN a.target_type = 'ISSUE' THEN a.target_id END,
  (SELECT s.issue_id::text FROM assignments s WHERE a.target_type = 'ASSIGNMENT' AND s.id::text = a.target_id),
  (SELECT r.issue_id::text FROM repair_submissions r WHERE a.target_type = 'SUBMISSION' AND r.id::text = a.target_id),
  (SELECT c.issue_id::text FROM comments c WHERE a.target_type = 'COMMENT' AND c.id::text = a.target_id)
)`;

/**
 * @param {{ action?, actor?, target?, issue?, from?, to?, page, pageSize }} filters
 *   issue: a reference (start of the id, "#" optional) or a full id.
 */
export async function listAuditLog(prisma, { user, action, actor, target, issue, from, to, page, pageSize }) {
  const { departmentId } = departmentScope(user);
  const conds = [
    Prisma.sql`(x.issue_id IN (SELECT id::text FROM issues WHERE department_id = ${departmentId}::uuid)
      OR x.actor_id IN (SELECT id FROM users WHERE role = 'ADMIN' AND department_id = ${departmentId}::uuid))`,
  ];
  if (action) conds.push(Prisma.sql`x.action = ${action}`);
  if (target) conds.push(Prisma.sql`x.target_type = ${target}`);
  if (from) conds.push(Prisma.sql`x.created_at >= ${from}`);
  if (to) conds.push(Prisma.sql`x.created_at < ${to}`);
  if (actor === "ME") conds.push(Prisma.sql`x.actor_id = ${user.id}::uuid`);
  else if (actor === "SYSTEM") conds.push(Prisma.sql`x.actor_id IS NULL`);
  else if (actor) conds.push(Prisma.sql`x.actor_role::text = ${actor}`);
  if (issue) {
    const m = REF.exec(issue);
    if (!m) return { items: [], page, pageSize, total: 0 };
    conds.push(Prisma.sql`x.issue_id LIKE ${`${m[1].toLowerCase()}%`}`);
  }
  const where = Prisma.join(conds, " AND ");
  const scoped = Prisma.sql`
    SELECT * FROM (
      SELECT a.id, a.actor_id, a.actor_role, a.action, a.target_type, a.created_at, ${ISSUE_OF} AS issue_id
      FROM audit_logs a
    ) x WHERE ${where}`;

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw`SELECT count(*)::int AS n FROM (${scoped}) y`,
    prisma.$queryRaw`SELECT y.id, y.issue_id AS "issueId" FROM (${scoped}) y ORDER BY y.created_at DESC, y.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  ]);
  const ids = idRows.map((r) => r.id);
  const rows = ids.length
    ? await prisma.auditLog.findMany({ where: { id: { in: ids } }, include: { actor: { select: { id: true, name: true, role: true } } } })
    : [];
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const issueOf = Object.fromEntries(idRows.map((r) => [String(r.id), r.issueId]));
  return {
    items: ids.map((id) => {
      const r = byId.get(String(id));
      return {
        id: String(r.id),
        at: r.createdAt,
        action: r.action,
        actor: r.actor ? { id: r.actor.id, name: r.actor.name, role: r.actorRole } : null, // null = system
        target: { type: r.targetType, id: r.targetId },
        issueId: issueOf[String(id)] ?? null,
        reason: r.reason,
        details: r.metadata ?? {},
      };
    }),
    page,
    pageSize,
    total: countRows[0]?.n ?? 0,
  };
}
