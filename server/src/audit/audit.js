// Audit log helper. Call it with the SAME transaction client as the change it records,
// so the change and its audit row are saved together or not at all:
//
//   await prisma.$transaction(async (tx) => {
//     await tx.issue.update(...);
//     await writeAudit(tx, { actor: req.user, action: AuditAction.ISSUE_STATUS_CHANGED,
//       targetType: AuditTarget.ISSUE, targetId: issue.id, reason, metadata: { from, to } });
//   });
import { z } from "zod";
import { AuditAction, AuditTarget } from "./actions.js";

const entrySchema = z.object({
  // Who: a user ({ id, role }) or null for system / seed / background job.
  actor: z.object({ id: z.string().uuid(), role: z.enum(["CITIZEN", "ADMIN", "CONTRACTOR"]) }).nullable(),
  action: z.enum(Object.values(AuditAction)),
  targetType: z.enum(Object.values(AuditTarget)),
  targetId: z.string().min(1),
  reason: z.string().trim().min(1).max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Write one audit row. "When" is set by the database (created_at).
 * @param {object} db Prisma client or transaction client
 * @param {{actor: {id:string, role:string}|null, action:string, targetType:string,
 *          targetId:string, reason?:string, metadata?:object}} entry
 */
export async function writeAudit(db, entry) {
  const e = entrySchema.parse(entry);
  return db.auditLog.create({
    data: {
      actorId: e.actor?.id ?? null,
      actorRole: e.actor?.role ?? null,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      reason: e.reason ?? null,
      metadata: e.metadata ?? undefined,
    },
  });
}

export { AuditAction, AuditTarget };
