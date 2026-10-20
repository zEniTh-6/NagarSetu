// Admin work queues (Phase 7c): repair evidence to verify, open disputes, reported/hidden comments,
// suspended citizens, and a contractor's active jobs. Everything is limited to the admin's
// department; anything else answers 404 (never leaked).
import { AppError } from "../../lib/AppError.js";
import { departmentScope } from "../../auth/scope.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { photoUrl } from "../issues/issues.views.js";
import { adminSubmissionView } from "../work/work.views.js";
import { deadlineView } from "../work/deadline.js";
import { adminFeedbackView } from "../feedback/feedback.service.js";
import { adminCommentView } from "../feed/feed.views.js";
import { ADMIN_COMMENT_INCLUDE } from "../feed/community.service.js";

const notFound = () => new AppError(404, "NOT_FOUND", "Not found");
const actorOf = (u) => ({ id: u.id, role: u.role });
const SHORT = 140;
const short = (s) => (s.length > SHORT ? `${s.slice(0, SHORT - 1)}…` : s);
const CURRENT_PHOTO = { where: { kind: "ISSUE_ORIGINAL", replacedAt: null }, orderBy: { createdAt: "desc" }, take: 1 };
const photoOf = (p) => (p ? { id: p.id, url: photoUrl(p.id) } : null);

/** A short description of an issue for queue rows. */
const issueBrief = (i) => ({
  id: i.id,
  status: i.status,
  category: { key: i.category.key, name: i.category.name },
  description: short(i.description),
  addressText: i.addressText ?? null,
  areaName: i.areaName ?? null,
  priority: i.priority ?? null,
  createdAt: i.createdAt,
  photo: photoOf(i.photos?.[0]),
});
const ISSUE_BRIEF_INCLUDE = { category: true, photos: CURRENT_PHOTO };

const paged = async (count, find, page, pageSize) => {
  const [total, rows] = await Promise.all([count(), find({ skip: (page - 1) * pageSize, take: pageSize })]);
  return { total, rows };
};

/** Repair evidence by status (default: waiting for the admin, oldest first). */
export async function listSubmissions(prisma, { user, status, page, pageSize }) {
  const where = { status, issue: departmentScope(user) };
  const { total, rows } = await paged(
    () => prisma.repairSubmission.count({ where }),
    (p) =>
      prisma.repairSubmission.findMany({
        where,
        include: { photos: true, contractor: { select: { id: true, name: true } }, issue: { include: ISSUE_BRIEF_INCLUDE } },
        orderBy: { createdAt: status === "SUBMITTED" ? "asc" : "desc" },
        ...p,
      }),
    page,
    pageSize,
  );
  return {
    items: rows.map((s) => ({ ...adminSubmissionView(s), contractor: s.contractor, issue: issueBrief(s.issue) })),
    page,
    pageSize,
    total,
  };
}

/** Resolved issues with an open dispute: before/after and what the citizens said. */
export async function listDisputes(prisma, { user, page, pageSize, now = new Date() }) {
  const where = { ...departmentScope(user), status: "RESOLVED", flags: { some: { type: "DISPUTED", clearedAt: null } } };
  const { total, rows } = await paged(
    () => prisma.issue.count({ where }),
    (p) =>
      prisma.issue.findMany({
        where,
        include: { ...ISSUE_BRIEF_INCLUDE, flags: { where: { type: "DISPUTED", clearedAt: null }, take: 1 } },
        orderBy: { resolvedAt: "asc" },
        ...p,
      }),
    page,
    pageSize,
  );
  const after = rows.length
    ? await prisma.photo.findMany({
        where: { issueId: { in: rows.map((i) => i.id) }, kind: "REPAIR_EVIDENCE", repairSubmission: { status: "APPROVED" } },
        orderBy: { createdAt: "desc" },
        distinct: ["issueId"],
      })
    : [];
  const afterBy = Object.fromEntries(after.map((p) => [p.issueId, p]));
  const items = [];
  for (const i of rows) {
    const { feedback } = await adminFeedbackView(prisma, i, now);
    const round = feedback.responses.filter((r) => r.roundResolvedAt.getTime() === i.resolvedAt.getTime());
    items.push({
      ...issueBrief(i),
      resolvedAt: i.resolvedAt,
      disputedAt: i.flags[0]?.createdAt ?? null,
      before: photoOf(i.photos[0]),
      after: photoOf(afterBy[i.id]),
      counts: feedback.current,
      notFixed: round.filter((r) => r.verdict === "NOT_FIXED"),
    });
  }
  return { items, page, pageSize, total };
}

/** Moderation queue: reported (still visible) or hidden comments on the department's issues. */
export async function listModerationComments(prisma, { user, filter, page, pageSize }) {
  const base = { issue: departmentScope(user), isOfficial: false };
  const where = filter === "hidden" ? { ...base, hiddenAt: { not: null } } : { ...base, hiddenAt: null, reports: { some: {} } };
  const orderBy = filter === "hidden" ? [{ hiddenAt: "desc" }] : [{ reports: { _count: "desc" } }, { createdAt: "asc" }];
  const { total, rows } = await paged(
    () => prisma.comment.count({ where }),
    (p) => prisma.comment.findMany({ where, include: { ...ADMIN_COMMENT_INCLUDE, issue: { include: ISSUE_BRIEF_INCLUDE } }, orderBy, ...p }),
    page,
    pageSize,
  );
  return { items: rows.map((c) => ({ ...adminCommentView(c), issue: issueBrief(c.issue) })), page, pageSize, total };
}

// ---------- Citizens (suspend / reactivate, decision A and D in D-026) ----------

/** A citizen linked to the admin's department: reported, supported or commented on one of its issues. */
async function linkedCitizen(prisma, user, citizenId) {
  const scope = departmentScope(user);
  const citizen = await prisma.user.findUnique({ where: { id: citizenId } });
  if (!citizen || citizen.role !== "CITIZEN") throw notFound();
  const [reported, supported, commented] = await Promise.all([
    prisma.issue.count({ where: { ...scope, reporterId: citizenId } }),
    prisma.issueSupporter.count({ where: { userId: citizenId, issue: scope } }),
    prisma.comment.count({ where: { authorId: citizenId, issue: scope } }),
  ]);
  if (!reported && !supported && !commented) throw notFound();
  return citizen;
}

const citizenView = (c) => ({ id: c.id, name: c.name, status: c.status, deactivatedAt: c.deactivatedAt, createdAt: c.createdAt });

export async function suspendCitizen(prisma, { user, citizenId, reason, now = new Date() }) {
  const citizen = await linkedCitizen(prisma, user, citizenId);
  if (citizen.status === "DEACTIVATED") throw new AppError(409, "ALREADY_SUSPENDED", "This account is already suspended");
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: citizenId }, data: { status: "DEACTIVATED", deactivatedAt: now } });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.USER_DEACTIVATED,
      targetType: AuditTarget.USER,
      targetId: citizenId,
      reason,
      metadata: { role: "CITIZEN", byDepartmentId: user.departmentId },
    });
    return u;
  });
  return citizenView(updated);
}

export async function reactivateCitizen(prisma, { user, citizenId, reason }) {
  const citizen = await linkedCitizen(prisma, user, citizenId);
  if (citizen.status !== "DEACTIVATED") throw new AppError(409, "NOT_SUSPENDED", "This account is not suspended");
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: citizenId }, data: { status: "ACTIVE", deactivatedAt: null } });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.USER_REACTIVATED,
      targetType: AuditTarget.USER,
      targetId: citizenId,
      reason,
      metadata: { role: "CITIZEN", byDepartmentId: user.departmentId },
    });
    return u;
  });
  return citizenView(updated);
}

/** Suspended citizens linked to the department, with the reason from the audit log. */
export async function listSuspendedCitizens(prisma, { user, page, pageSize }) {
  const scope = departmentScope(user);
  const where = {
    role: "CITIZEN",
    status: "DEACTIVATED",
    OR: [{ reportedIssues: { some: scope } }, { supports: { some: { issue: scope } } }, { comments: { some: { issue: scope } } }],
  };
  const { total, rows } = await paged(
    () => prisma.user.count({ where }),
    (p) => prisma.user.findMany({ where, orderBy: { deactivatedAt: "desc" }, ...p }),
    page,
    pageSize,
  );
  const reasons = rows.length
    ? await prisma.auditLog.findMany({
        where: { action: AuditAction.USER_DEACTIVATED, targetType: AuditTarget.USER, targetId: { in: rows.map((r) => r.id) } },
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const latest = {};
  for (const r of reasons) latest[r.targetId] ??= r;
  return {
    items: rows.map((c) => ({ ...citizenView(c), reason: latest[c.id]?.reason ?? null, by: latest[c.id]?.actor ?? null })),
    page,
    pageSize,
    total,
  };
}

// ---------- Contractor jobs (before deactivating) ----------

/**
 * A contractor's active jobs: details for the admin's department (to reassign), only a count for
 * other departments (D-005: contractors aren't tied to a department).
 */
export async function contractorJobs(prisma, { user, contractorId, now = new Date() }) {
  const scope = departmentScope(user);
  const contractor = await prisma.user.findUnique({ where: { id: contractorId } });
  if (!contractor || contractor.role !== "CONTRACTOR") throw notFound();
  const [mine, others] = await Promise.all([
    prisma.assignment.findMany({
      where: { contractorId, endedAt: null, issue: scope },
      include: { issue: { include: ISSUE_BRIEF_INCLUDE } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.assignment.count({ where: { contractorId, endedAt: null, issue: { departmentId: { not: scope.departmentId } } } }),
  ]);
  return {
    contractorId,
    jobs: mine.map((a) => {
      const deadline = deadlineView(a, now);
      return {
        assignmentId: a.id,
        assignedAt: a.createdAt,
        startedAt: a.startedAt,
        deadline,
        overdue: !deadline.paused && deadline.effectiveDeadline < now,
        issue: issueBrief(a.issue),
      };
    }),
    otherDepartmentsJobs: others,
  };
}
