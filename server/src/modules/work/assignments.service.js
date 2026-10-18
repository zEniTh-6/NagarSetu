// Admin side of the work: pick a contractor, set the deadline, reassign, change the deadline.
// Department-scoped like every admin action; audited; the contractor is notified in-app.
// Nothing ever happens to a contractor automatically.
import { AppError } from "../../lib/AppError.js";
import { assertInDepartment } from "../../auth/scope.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { notifyIssueFollowers } from "../notifications/notifications.service.js";
import { publicContractor } from "../contractors/contractors.service.js";
import { clearEscalation } from "./escalation.service.js";

const actorOf = (u) => ({ id: u.id, role: u.role });
const MAX_DEADLINE_MS = 366 * 24 * 60 * 60 * 1000;

export const activeAssignment = (db, issueId) =>
  db.assignment.findFirst({ where: { issueId, endedAt: null }, include: { contractor: true } });

async function loadIssue(db, user, issueId) {
  return assertInDepartment(user, await db.issue.findUnique({ where: { id: issueId } }));
}

function checkDeadline(deadlineAt, now) {
  if (deadlineAt <= now) throw new AppError(400, "DEADLINE_IN_PAST", "The deadline must be in the future");
  if (deadlineAt - now > MAX_DEADLINE_MS) throw new AppError(400, "DEADLINE_TOO_FAR", "The deadline must be within a year");
}

/** Only an active contractor who has accepted the invite (so they can log in) can get work. */
async function loadContractor(db, contractorId) {
  const c = await db.user.findUnique({ where: { id: contractorId } });
  if (!c || c.role !== "CONTRACTOR") throw new AppError(404, "CONTRACTOR_NOT_FOUND", "Contractor not found");
  if (c.status !== "ACTIVE") throw new AppError(409, "CONTRACTOR_INACTIVE", "This contractor is deactivated");
  if (!c.passwordHash) throw new AppError(409, "CONTRACTOR_INVITE_PENDING", "This contractor hasn't accepted the invite yet");
  return c;
}

async function createAssignment(tx, { user, issue, contractor, deadlineAt }) {
  const assignment = await tx.assignment.create({
    data: { issueId: issue.id, contractorId: contractor.id, assignedById: user.id, departmentId: user.departmentId, deadlineAt },
  });
  await writeAudit(tx, {
    actor: actorOf(user),
    action: AuditAction.ASSIGNMENT_CREATED,
    targetType: AuditTarget.ISSUE,
    targetId: issue.id,
    metadata: { assignmentId: assignment.id, contractorId: contractor.id, departmentId: user.departmentId, deadlineAt: deadlineAt.toISOString() },
  });
  await tx.notification.create({
    data: { userId: contractor.id, type: "ASSIGNED", issueId: issue.id, params: { audience: "CONTRACTOR", deadlineAt: deadlineAt.toISOString() } },
  });
  return assignment;
}

/**
 * Assign an ACKNOWLEDGED issue that has a final priority. The status stays ACKNOWLEDGED until the
 * contractor starts work. Reporter and supporters hear that a contractor was assigned (no deadline).
 */
export async function assignContractor(prisma, { user, issueId, contractorId, deadlineAt, now = new Date() }) {
  const issue = await loadIssue(prisma, user, issueId);
  if (issue.status !== "ACKNOWLEDGED") throw new AppError(409, "NOT_ACKNOWLEDGED", "Accept the report before assigning it");
  if (!issue.priority) throw new AppError(409, "PRIORITY_REQUIRED", "Set the final priority before assigning");
  if (await activeAssignment(prisma, issueId)) throw new AppError(409, "ALREADY_ASSIGNED", "Already assigned; use reassign");
  checkDeadline(deadlineAt, now);
  const contractor = await loadContractor(prisma, contractorId);

  try {
    await prisma.$transaction(async (tx) => {
      await createAssignment(tx, { user, issue, contractor, deadlineAt });
      await notifyIssueFollowers(tx, { issueId, type: "ASSIGNED", params: {} });
    });
  } catch (err) {
    // Two admins at once: the database allows only one active assignment per issue.
    if (err?.code === "P2002") throw new AppError(409, "ALREADY_ASSIGNED", "Already assigned; use reassign");
    throw err;
  }
}

/**
 * Give the job to another contractor (e.g. the first was deactivated). The old assignment ends
 * with the reason; its history is kept. Not while a repair is waiting for review.
 */
export async function reassignContractor(prisma, { user, issueId, contractorId, deadlineAt, reason, now = new Date() }) {
  const issue = await loadIssue(prisma, user, issueId);
  if (!["ACKNOWLEDGED", "IN_PROGRESS"].includes(issue.status)) throw new AppError(409, "ISSUE_NOT_OPEN", "Only open issues can be reassigned");
  const current = await activeAssignment(prisma, issueId);
  if (!current) throw new AppError(409, "NOT_ASSIGNED", "Not assigned yet; use assign");
  if (current.contractorId === contractorId) throw new AppError(400, "SAME_CONTRACTOR", "Already assigned to this contractor");
  const pending = await prisma.repairSubmission.count({ where: { assignmentId: current.id, status: "SUBMITTED" } });
  if (pending) throw new AppError(409, "SUBMISSION_PENDING", "Review the waiting repair submission first");
  checkDeadline(deadlineAt, now);
  const contractor = await loadContractor(prisma, contractorId);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.assignment.updateMany({
      where: { id: current.id, endedAt: null },
      data: { endedAt: now, endReason: reason },
    });
    if (count !== 1) throw new AppError(409, "ALREADY_HANDLED", "Someone else already changed this assignment");
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.ASSIGNMENT_ENDED,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      reason,
      metadata: { assignmentId: current.id, contractorId: current.contractorId },
    });
    await tx.notification.create({
      data: { userId: current.contractorId, type: "ASSIGNMENT_ENDED", issueId, params: { reason } },
    });
    await createAssignment(tx, { user, issue, contractor, deadlineAt });
    await clearEscalation(tx, issueId, { actor: actorOf(user), reason: "Reassigned with a new deadline", now });
  });
}

/** Change the deadline (admin only, reason required). The contractor is told. */
export async function changeDeadline(prisma, { user, issueId, deadlineAt, reason, now = new Date() }) {
  await loadIssue(prisma, user, issueId);
  const current = await activeAssignment(prisma, issueId);
  if (!current) throw new AppError(409, "NOT_ASSIGNED", "Not assigned yet");
  checkDeadline(deadlineAt, now);

  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id: current.id }, data: { deadlineAt, lastEscalationNoticeAt: null } });
    // A future deadline means it's no longer overdue.
    await clearEscalation(tx, issueId, { actor: actorOf(user), reason: "Deadline extended", now });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.DEADLINE_SET,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      reason,
      metadata: { assignmentId: current.id, from: current.deadlineAt.toISOString(), to: deadlineAt.toISOString() },
    });
    await tx.notification.create({
      data: { userId: current.contractorId, type: "DEADLINE_CHANGED", issueId, params: { deadlineAt: deadlineAt.toISOString(), reason } },
    });
  });
}

/**
 * Contractors to choose from (any admin sees all; contractors aren't tied to a department).
 * Work type is shown as information, not a restriction. Active ones first.
 */
export async function listContractors(prisma, { search, includeInactive }) {
  const q = search?.trim();
  const contractors = await prisma.user.findMany({
    where: {
      role: "CONTRACTOR",
      ...(includeInactive ? {} : { status: "ACTIVE" }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { workType: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { licenceNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 100,
  });
  const jobs = await prisma.assignment.groupBy({
    by: ["contractorId"],
    where: { contractorId: { in: contractors.map((c) => c.id) }, endedAt: null },
    _count: { _all: true },
  });
  const count = Object.fromEntries(jobs.map((j) => [j.contractorId, j._count._all]));
  return contractors.map((c) => ({ ...publicContractor(c), activeJobs: count[c.id] ?? 0 }));
}
