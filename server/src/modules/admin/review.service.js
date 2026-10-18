// Admin review of a report (brief, workflow steps 6–7). Every action:
//   - is limited to the admin's own department (another department's issue answers 404),
//   - writes an audit row (who, when, why) in the same transaction as the change,
//   - tells the reporter and supporters what happened and why (in-app notification).
// Accept / reject / forward / link-duplicate / reroute are exits from REPORTED only. If two admins
// act at once, the first one wins and the second gets 409 ALREADY_HANDLED.
import { AppError } from "../../lib/AppError.js";
import { assertInDepartment } from "../../auth/scope.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { ACTIVE_STATUSES } from "../../geo/duplicates.js";
import { clearFlags } from "../issues/flags.js";
import { notifyIssueFollowers } from "../notifications/notifications.service.js";

const actorOf = (u) => ({ id: u.id, role: u.role });
const notReported = () => new AppError(409, "NOT_REPORTED", "Only new reports (status REPORTED) can be reviewed this way");
const alreadyHandled = () => new AppError(409, "ALREADY_HANDLED", "Someone else already handled this report");

/** Flags an admin may clear or confirm here. ESCALATED and DISPUTED have their own flows (later phases). */
export const REVIEWABLE_FLAGS = ["SUSPICIOUS", "POSSIBLE_DUPLICATE", "PENDING_REVIEW"];
export const REROUTE_CLEAR_REASON = "Category changed; the duplicate check runs again";

async function loadIssue(db, user, issueId) {
  const issue = await db.issue.findUnique({ where: { id: issueId }, include: { category: true } });
  return assertInDepartment(user, issue);
}

/** Conditional update: only succeeds while the issue is still REPORTED in this department. */
async function leaveReported(tx, issue, data) {
  const { count } = await tx.issue.updateMany({
    where: { id: issue.id, status: "REPORTED", departmentId: issue.departmentId },
    data,
  });
  if (count !== 1) throw alreadyHandled();
}

const statusAudit = (tx, user, issue, to, reason, extra = {}) =>
  writeAudit(tx, {
    actor: actorOf(user),
    action: AuditAction.ISSUE_STATUS_CHANGED,
    targetType: AuditTarget.ISSUE,
    targetId: issue.id,
    reason,
    metadata: { from: issue.status, to, ...extra },
  });

/**
 * Final priority. The AI risk level is the suggestion; choosing something else needs a reason.
 * With no AI suggestion (not checked yet), the reason is optional.
 */
export function checkPriorityReason(issue, priority, reason) {
  if (issue.aiRiskLevel && priority !== issue.aiRiskLevel && !reason) {
    throw new AppError(400, "PRIORITY_REASON_REQUIRED", `Give a reason for choosing ${priority} instead of the suggested ${issue.aiRiskLevel}`);
  }
}

async function writePriority(tx, user, issue, priority, reason) {
  await tx.issue.update({ where: { id: issue.id }, data: { priority, priorityReason: reason ?? null } });
  await writeAudit(tx, {
    actor: actorOf(user),
    action: AuditAction.ISSUE_PRIORITY_SET,
    targetType: AuditTarget.ISSUE,
    targetId: issue.id,
    reason: reason ?? undefined,
    metadata: { from: issue.priority, to: priority, suggestion: issue.aiRiskLevel ?? null },
  });
}

/** Accept → ACKNOWLEDGED. The final priority can be set in the same step. */
export async function acceptIssue(prisma, { user, issueId, priority, priorityReason, now = new Date() }) {
  const issue = await loadIssue(prisma, user, issueId);
  if (issue.status !== "REPORTED") throw notReported();
  if (priority) checkPriorityReason(issue, priority, priorityReason);

  await prisma.$transaction(async (tx) => {
    await leaveReported(tx, issue, { status: "ACKNOWLEDGED", acknowledgedAt: now, statusReason: null });
    await statusAudit(tx, user, issue, "ACKNOWLEDGED", "Accepted by the department admin");
    if (priority) await writePriority(tx, user, issue, priority, priorityReason);
    await notifyIssueFollowers(tx, { issueId, type: "ACKNOWLEDGED", params: {} });
  });
}

/**
 * Reject → REJECTED with a mandatory reason, shown to the citizen.
 * type NOT_OUR_JURISDICTION = "forwarded" (e.g. a state highway): the reason says where to.
 */
export async function rejectIssue(prisma, { user, issueId, type, reason }) {
  const issue = await loadIssue(prisma, user, issueId);
  if (issue.status !== "REPORTED") throw notReported();

  await prisma.$transaction(async (tx) => {
    await leaveReported(tx, issue, { status: "REJECTED", rejectionType: type, statusReason: reason });
    await statusAudit(tx, user, issue, "REJECTED", reason, { rejectionType: type });
    await notifyIssueFollowers(tx, { issueId, type: "REJECTED", params: { rejectionType: type, reason } });
  });
}

/** Follows "duplicate of" links to the issue that is still open (at most a few hops). */
async function resolveTarget(db, user, targetIssueId) {
  let target = await db.issue.findUnique({ where: { id: targetIssueId } });
  for (let hops = 0; target?.status === "DUPLICATE" && target.duplicateOfId && hops < 10; hops += 1) {
    target = await db.issue.findUnique({ where: { id: target.duplicateOfId } });
  }
  return assertInDepartment(user, target);
}

/**
 * Link as duplicate → DUPLICATE of an active issue in the same category. Nothing is deleted:
 * the reporter and supporters (and upvotes) are added to the open issue, so their support counts.
 */
export async function linkDuplicate(prisma, { user, issueId, targetIssueId, reason }) {
  const issue = await loadIssue(prisma, user, issueId);
  if (targetIssueId === issueId) throw new AppError(400, "SAME_ISSUE", "An issue can't be a duplicate of itself");
  const target = await resolveTarget(prisma, user, targetIssueId);
  if (target.id === issue.id) throw new AppError(400, "SAME_ISSUE", "An issue can't be a duplicate of itself");
  if (issue.status !== "REPORTED") throw notReported();
  if (!ACTIVE_STATUSES.includes(target.status)) throw new AppError(409, "TARGET_NOT_ACTIVE", "That issue is closed; link to an open one");
  if (target.categoryId !== issue.categoryId) {
    throw new AppError(409, "DIFFERENT_CATEGORY", "Duplicates must be in the same category. Reroute the report first if its category is wrong");
  }

  await prisma.$transaction(async (tx) => {
    await leaveReported(tx, issue, { status: "DUPLICATE", duplicateOfId: target.id, statusReason: reason ?? null });
    // Reports linked to this one earlier now point at the open issue too.
    await tx.issue.updateMany({ where: { duplicateOfId: issue.id }, data: { duplicateOfId: target.id } });

    const supporters = await tx.issueSupporter.findMany({ where: { issueId: issue.id }, select: { userId: true } });
    const backers = [...new Set([issue.reporterId, ...supporters.map((s) => s.userId)])].filter((id) => id !== target.reporterId);
    const moved = await tx.issueSupporter.createMany({
      data: backers.map((userId) => ({ issueId: target.id, userId, source: "LINKED_BY_ADMIN" })),
      skipDuplicates: true,
    });
    const upvotes = await tx.upvote.findMany({ where: { issueId: issue.id }, select: { userId: true } });
    await tx.upvote.createMany({
      data: upvotes.filter((u) => u.userId !== target.reporterId).map((u) => ({ issueId: target.id, userId: u.userId })),
      skipDuplicates: true,
    });

    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.ISSUE_LINKED_DUPLICATE,
      targetType: AuditTarget.ISSUE,
      targetId: issue.id,
      reason: reason ?? undefined,
      metadata: { from: "REPORTED", to: "DUPLICATE", duplicateOfId: target.id, supportersAdded: moved.count },
    });
    // Tell the people following this report (not the open issue's followers).
    await notifyIssueFollowers(tx, { issueId, type: "LINKED_DUPLICATE", params: { duplicateOfId: target.id, reason: reason ?? null } });
  });
  return { duplicateOfId: target.id };
}

/**
 * Reroute → another category (and so that category's department). Only while REPORTED: the new
 * department's admin then reviews it. Priority and duplicate flags from the old category are
 * cleared and the duplicate check runs again in the new one.
 */
export async function rerouteIssue(prisma, { user, issueId, categoryKey, reason, jobs }) {
  const issue = await loadIssue(prisma, user, issueId);
  if (issue.status !== "REPORTED") throw notReported();
  const category = await prisma.category.findUnique({ where: { key: categoryKey }, include: { department: true } });
  if (!category || !category.active) throw new AppError(400, "UNKNOWN_CATEGORY", "Unknown category");
  if (category.id === issue.categoryId) throw new AppError(400, "SAME_CATEGORY", "The report is already in that category");

  await prisma.$transaction(async (tx) => {
    await leaveReported(tx, issue, { categoryId: category.id, departmentId: category.departmentId, priority: null, priorityReason: null });
    await clearFlags(tx, { issueId, type: "POSSIBLE_DUPLICATE", clearReason: REROUTE_CLEAR_REASON, actor: actorOf(user) });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.ISSUE_REROUTED,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      reason,
      metadata: {
        fromCategory: issue.category.key,
        toCategory: category.key,
        fromDepartmentId: issue.departmentId,
        toDepartmentId: category.departmentId,
      },
    });
    await notifyIssueFollowers(tx, {
      issueId,
      type: "REROUTED",
      params: { fromCategory: issue.category.key, toCategory: category.key, reason },
    });
  });

  try {
    await jobs.enqueueEmbedding({ issueId, recheck: true });
  } catch (err) {
    console.error("Could not queue the duplicate re-check:", err);
  }
  return {
    issueId,
    category: { key: category.key, name: category.name },
    department: { code: category.department.code, name: category.department.name },
    // A different department now owns it; this admin can no longer open it.
    stillInYourDepartment: category.departmentId === user.departmentId,
  };
}

/** Final priority on an open issue (REPORTED, ACKNOWLEDGED or IN_PROGRESS). */
export async function setPriority(prisma, { user, issueId, priority, reason }) {
  const issue = await loadIssue(prisma, user, issueId);
  if (!ACTIVE_STATUSES.includes(issue.status)) throw new AppError(409, "ISSUE_NOT_ACTIVE", "This issue is closed");
  checkPriorityReason(issue, priority, reason);
  await prisma.$transaction((tx) => writePriority(tx, user, issue, priority, reason));
}

async function loadFlag(prisma, user, issueId, flagId) {
  await loadIssue(prisma, user, issueId);
  const flag = await prisma.issueFlag.findUnique({ where: { id: flagId } });
  if (!flag || flag.issueId !== issueId) throw new AppError(404, "NOT_FOUND", "Not found");
  if (flag.clearedAt) throw new AppError(409, "FLAG_ALREADY_CLEARED", "This flag was already cleared");
  if (!REVIEWABLE_FLAGS.includes(flag.type)) throw new AppError(409, "FLAG_NOT_REVIEWABLE", "This flag is handled elsewhere");
  return flag;
}

/** Clear a flag: the admin looked and it doesn't apply (reason recorded). */
export async function clearFlag(prisma, { user, issueId, flagId, reason, now = new Date() }) {
  const flag = await loadFlag(prisma, user, issueId, flagId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.issueFlag.updateMany({
      where: { id: flag.id, clearedAt: null },
      data: { clearedAt: now, clearedById: user.id, clearReason: reason },
    });
    if (count !== 1) throw new AppError(409, "FLAG_ALREADY_CLEARED", "This flag was already cleared");
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.FLAG_CLEARED,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      reason,
      metadata: { flagId: flag.id, type: flag.type },
    });
  });
}

/** Confirm a flag: the admin agrees. It stays active as information; nothing else happens. */
export async function confirmFlag(prisma, { user, issueId, flagId, reason, now = new Date() }) {
  const flag = await loadFlag(prisma, user, issueId, flagId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.issueFlag.updateMany({
      where: { id: flag.id, clearedAt: null, confirmedAt: null },
      data: { confirmedAt: now, confirmedById: user.id, confirmReason: reason },
    });
    if (count !== 1) throw new AppError(409, "FLAG_ALREADY_CONFIRMED", "This flag was already confirmed");
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.FLAG_CONFIRMED,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      reason,
      metadata: { flagId: flag.id, type: flag.type },
    });
  });
}
