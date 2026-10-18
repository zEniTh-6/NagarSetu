// Deadline escalation (brief: "Deadlines and escalation"). Runs as a scheduled background job.
//   - Overdue = the EFFECTIVE deadline (admin's deadline + time paused for review) has passed.
//   - While a repair waits for review the clock is paused: no new escalation, no reminders.
//   - Overdue → ESCALATED flag + notify the department's admins once, then remind every
//     ESCALATION_REMINDER_HOURS while it stays overdue.
//   - NOTHING happens to the contractor. The admin decides (extend, reassign, review…).
//   - When it's no longer overdue (deadline extended, reassigned, resolved) the flag is cleared.
import { env } from "../../config/env.js";
import { addFlag, clearFlags, FLAG_REASON } from "../issues/flags.js";
import { notifyDepartmentAdmins } from "../notifications/notifications.service.js";
import { effectiveDeadline } from "./deadline.js";

const HOUR_MS = 60 * 60 * 1000;
export const NO_LONGER_OVERDUE = "No longer past the deadline";

/** Clears ESCALATED on an issue (used by the job and right away by deadline change / reassign / approve). */
export const clearEscalation = (tx, issueId, { actor = null, reason = NO_LONGER_OVERDUE, now = new Date() } = {}) =>
  clearFlags(tx, { issueId, type: "ESCALATED", clearReason: reason, actor, now });

/**
 * @returns {Promise<{ escalated: string[], reminded: string[], cleared: string[] }>} issue ids
 */
export async function runDeadlineCheck(prisma, { now = new Date(), reminderHours = env.ESCALATION_REMINDER_HOURS } = {}) {
  const result = { escalated: [], reminded: [], cleared: [] };
  const assignments = await prisma.assignment.findMany({
    where: { endedAt: null, issue: { status: { in: ["ACKNOWLEDGED", "IN_PROGRESS"] } } },
    include: { issue: true },
  });

  const overdueIssues = new Set();
  for (const a of assignments) {
    const deadline = effectiveDeadline(a, now);
    if (deadline > now) continue; // on time (a running pause keeps moving the deadline too)
    overdueIssues.add(a.issueId);
    if (a.pausedSince) continue; // waiting for the admin's review: no escalation while paused

    const due = !a.lastEscalationNoticeAt || now - a.lastEscalationNoticeAt >= reminderHours * HOUR_MS;
    const added = await prisma.$transaction(async (tx) => {
      const flagged = await tx.issueFlag.findFirst({ where: { issueId: a.issueId, type: "ESCALATED", clearedAt: null } });
      if (!flagged) {
        await addFlag(tx, {
          issueId: a.issueId,
          type: "ESCALATED",
          reason: FLAG_REASON.DEADLINE_PASSED,
          detail: `deadline was ${deadline.toISOString()}, work ${a.startedAt ? "started" : "not started"}`,
        });
      }
      if (due) {
        await notifyDepartmentAdmins(tx, {
          departmentId: a.issue.departmentId,
          type: "ESCALATED",
          issueId: a.issueId,
          params: { deadlineAt: deadline.toISOString(), workStarted: Boolean(a.startedAt), reminder: Boolean(a.lastEscalationNoticeAt) },
        });
        await tx.assignment.update({ where: { id: a.id }, data: { lastEscalationNoticeAt: now } });
      }
      return !flagged;
    });
    if (added) result.escalated.push(a.issueId);
    else if (due) result.reminded.push(a.issueId);
  }

  // ESCALATED flags on issues that are no longer overdue.
  const flags = await prisma.issueFlag.findMany({ where: { type: "ESCALATED", clearedAt: null }, select: { issueId: true } });
  for (const issueId of new Set(flags.map((f) => f.issueId))) {
    if (overdueIssues.has(issueId)) continue;
    await prisma.$transaction(async (tx) => {
      await clearEscalation(tx, issueId, { now });
      await tx.assignment.updateMany({ where: { issueId, endedAt: null }, data: { lastEscalationNoticeAt: null } });
    });
    result.cleared.push(issueId);
  }
  return result;
}

