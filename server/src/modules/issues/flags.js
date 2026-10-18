// Flags are separate from status and never block the workflow. Every add/clear is audited.
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";

export const FLAG_REASON = Object.freeze({
  VALIDATION_PENDING: "Photo validation pending (AI unavailable, retrying)",
  VALIDATION_GAVE_UP: "Photo could not be checked automatically. Please review the photo",
  AI_UNCERTAIN: "AI was not sure about the photo",
  GPS_MISMATCH: "Pin is far from the device GPS",
  REPAIR_GPS_MISMATCH: "Repair photo was taken far from the issue",
  DEADLINE_PASSED: "Deadline passed",
  NOT_FIXED: "Citizen says it is not fixed",
});

/** Adds an active flag unless the same type+reason is already active. */
export async function addFlag(tx, { issueId, type, reason, detail, actor = null }) {
  const existing = await tx.issueFlag.findFirst({ where: { issueId, type, reason, clearedAt: null } });
  if (existing) return existing;
  const flag = await tx.issueFlag.create({
    data: { issueId, type, reason, raisedById: actor?.id ?? null },
  });
  await writeAudit(tx, {
    actor,
    action: AuditAction.FLAG_ADDED,
    targetType: AuditTarget.ISSUE,
    targetId: issueId,
    reason: detail ? `${reason}: ${detail}` : reason,
    metadata: { flagId: flag.id, type },
  });
  return flag;
}

/** Clears active flags of a type (optionally only with a given reason). */
export async function clearFlags(tx, { issueId, type, reason, clearReason, actor = null, now = new Date() }) {
  const flags = await tx.issueFlag.findMany({ where: { issueId, type, clearedAt: null, ...(reason ? { reason } : {}) } });
  for (const flag of flags) {
    await tx.issueFlag.update({
      where: { id: flag.id },
      data: { clearedAt: now, clearedById: actor?.id ?? null, clearReason },
    });
    await writeAudit(tx, {
      actor,
      action: AuditAction.FLAG_CLEARED,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      reason: clearReason,
      metadata: { flagId: flag.id, type },
    });
  }
  return flags.length;
}
