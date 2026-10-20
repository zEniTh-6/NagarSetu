// Admin issues table, dashboard counts and the extra parts of the review screen.
// Everything is limited to the admin's department.
import { departmentScope } from "../../auth/scope.js";
import { ACTIVE_STATUSES } from "../../geo/duplicates.js";
import { issueLocations, distancesFrom } from "../../geo/issues.js";
import { photoUrl } from "../issues/issues.views.js";
import { communitySignals } from "./community.js";
import { suggestedDeadline, deadlineDays, deadlineView } from "../work/deadline.js";
import { adminAssignmentView, adminSubmissionView } from "../work/work.views.js";
import { adminFeedbackView } from "../feedback/feedback.service.js";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SHORT = 140;
const short = (s) => (s.length > SHORT ? `${s.slice(0, SHORT - 1)}…` : s);

const ORDER = {
  newest: [{ createdAt: "desc" }],
  oldest: [{ createdAt: "asc" }],
  risk: [{ aiRiskLevel: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
  priority: [{ priority: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
  support: [{ supporters: { _count: "desc" } }, { upvotes: { _count: "desc" } }, { createdAt: "asc" }],
};

const REF = /^#?([0-9a-f]{4,8})$/i;

/** Ids of the department's issues whose reference (start of the id) matches. Parameterised. */
async function idsByRef(prisma, user, prefix) {
  const rows = await prisma.$queryRaw`
    SELECT id::text AS id FROM issues
    WHERE department_id = ${departmentScope(user).departmentId}::uuid AND id::text LIKE ${`${prefix.toLowerCase()}%`}
    LIMIT 50`;
  return rows.map((r) => r.id);
}

async function listWhere(prisma, user, { status, category, flag, priority, q, from, to, stage }) {
  const where = { ...departmentScope(user) };
  if (status === "ACTIVE") where.status = { in: ACTIVE_STATUSES };
  else if (status !== "ALL") where.status = status;
  if (category) where.category = { key: category };
  if (flag) where.flags = { some: { type: flag, clearedAt: null } };
  if (priority === "NONE") where.priority = null;
  else if (priority) where.priority = priority;
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
  if (stage === "REPAIR_REVIEW") where.submissions = { some: { status: "SUBMITTED" } };
  if (q) {
    const ref = REF.exec(q);
    const refIds = ref ? await idsByRef(prisma, user, ref[1]) : [];
    where.AND = [
      {
        OR: [
          { description: { contains: q, mode: "insensitive" } },
          { addressText: { contains: q, mode: "insensitive" } },
          { areaName: { contains: q, mode: "insensitive" } },
          ...(refIds.length ? [{ id: { in: refIds } }] : []),
        ],
      },
    ];
  }
  return where;
}

/** The issues table. Default: reports waiting for review (REPORTED), newest first. */
export async function listAdminIssues(prisma, { user, page, pageSize, sort, ...filters }) {
  const where = await listWhere(prisma, user, filters);
  const now = new Date();
  const [total, issues] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.findMany({
      where,
      include: {
        category: true,
        flags: { where: { clearedAt: null }, orderBy: { createdAt: "asc" } },
        photos: { where: { kind: "ISSUE_ORIGINAL", replacedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
        assignments: { where: { endedAt: null }, include: { contractor: { select: { id: true, name: true, status: true } } }, take: 1 },
        submissions: { where: { status: "SUBMITTED" }, select: { id: true }, take: 1 },
      },
      orderBy: ORDER[sort],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const ids = issues.map((i) => i.id);
  const [signals, locations] = await Promise.all([communitySignals(prisma, ids), issueLocations(prisma, ids)]);
  return {
    items: issues.map((i) => ({
      id: i.id,
      status: i.status,
      category: { key: i.category.key, name: i.category.name },
      description: short(i.description),
      addressText: i.addressText,
      location: locations[i.id],
      photo: i.photos[0] ? { id: i.photos[0].id, url: photoUrl(i.photos[0].id) } : null,
      createdAt: i.createdAt,
      ai: { verdict: i.aiVerdict, riskLevel: i.aiRiskLevel },
      priority: i.priority,
      community: signals[i.id],
      flags: i.flags.map((f) => ({ id: f.id, type: f.type, confirmed: Boolean(f.confirmedAt) })),
      areaName: i.areaName ?? null,
      assignment: i.assignments[0] ? listAssignment(i.assignments[0], now) : null,
      repairToReview: i.submissions.length > 0,
    })),
    page,
    pageSize,
    total,
  };
}

/** Current assignee and deadline for the table. Overdue = past the effective deadline (paused review time added). */
function listAssignment(a, now) {
  const deadline = deadlineView(a, now);
  return {
    contractor: { id: a.contractor.id, name: a.contractor.name, status: a.contractor.status },
    startedAt: a.startedAt,
    deadline,
    overdue: !deadline.paused && deadline.effectiveDeadline < now,
  };
}

/** Dashboard counts for the admin's department. */
export async function adminDashboard(prisma, { user }) {
  const scope = departmentScope(user);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [byStatus, byFlag, needsPriority, needsAssignment, repairsToReview, needsReassignment, escalated, disputed, newLast24h] = await Promise.all([
    prisma.issue.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.issueFlag.groupBy({
      by: ["type"],
      where: { clearedAt: null, issue: { ...scope, status: { in: ACTIVE_STATUSES } } },
      _count: { _all: true },
    }),
    prisma.issue.count({ where: { ...scope, status: { in: ["ACKNOWLEDGED", "IN_PROGRESS"] }, priority: null } }),
    prisma.issue.count({ where: { ...scope, status: "ACKNOWLEDGED", assignments: { none: { endedAt: null } } } }),
    prisma.repairSubmission.count({ where: { status: "SUBMITTED", issue: scope } }),
    // Jobs held by a deactivated contractor: the admin must reassign them (nothing happens automatically).
    prisma.assignment.count({ where: { endedAt: null, issue: scope, contractor: { status: { not: "ACTIVE" } } } }),
    prisma.issue.count({ where: { ...scope, flags: { some: { type: "ESCALATED", clearedAt: null } } } }),
    prisma.issue.count({ where: { ...scope, status: "RESOLVED", flags: { some: { type: "DISPUTED", clearedAt: null } } } }),
    prisma.issue.count({ where: { ...scope, createdAt: { gte: since } } }),
  ]);
  const department = await prisma.department.findUnique({ where: { id: scope.departmentId }, select: { id: true, code: true, name: true } });
  const statuses = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
  return {
    department,
    newLast24h, // reports created in the last 24 hours (any status)
    inProgress: statuses.IN_PROGRESS ?? 0,
    waitingForReview: statuses.REPORTED ?? 0,
    needsPriority,
    needsAssignment,
    repairsToReview,
    needsReassignment,
    escalated,
    disputed,
    byStatus: statuses,
    activeFlags: Object.fromEntries(byFlag.map((r) => [r.type, r._count._all])),
  };
}

const brief = (i, distanceM) => ({
  id: i.id,
  status: i.status,
  category: i.category.key,
  description: short(i.description),
  createdAt: i.createdAt,
  ...(distanceM !== undefined ? { distanceM } : {}),
});

/**
 * Extra parts of the admin review screen: community signal, related duplicates and history.
 * Only issues of the admin's department are shown (anything else is left out, never leaked).
 */
export async function adminReviewExtras(prisma, { user, issue }) {
  const scope = departmentScope(user);
  const flaggedIds = [
    ...new Set(
      (issue.flags ?? [])
        .filter((f) => f.type === "POSSIBLE_DUPLICATE")
        .flatMap((f) => f.reason?.match(UUID) ?? [])
        .map((id) => id.toLowerCase())
        .filter((id) => id !== issue.id),
    ),
  ];

  const now = new Date();
  const [signals, possible, linkedTo, linkedHere, history, assignments, submissions] = await Promise.all([
    communitySignals(prisma, [issue.id]),
    flaggedIds.length ? prisma.issue.findMany({ where: { id: { in: flaggedIds }, ...scope }, include: { category: true } }) : [],
    issue.duplicateOfId ? prisma.issue.findFirst({ where: { id: issue.duplicateOfId, ...scope }, include: { category: true } }) : null,
    prisma.issue.findMany({ where: { duplicateOfId: issue.id, ...scope }, include: { category: true }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({
      where: { targetType: "ISSUE", targetId: issue.id },
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.assignment.findMany({ where: { issueId: issue.id }, include: { contractor: true }, orderBy: { createdAt: "asc" } }),
    prisma.repairSubmission.findMany({ where: { issueId: issue.id }, include: { photos: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const current = assignments.find((a) => !a.endedAt) ?? null;
  const feedback = await adminFeedbackView(prisma, issue, now);
  const distances = await distancesFrom(prisma, issue.id, possible.map((p) => p.id));

  return {
    community: signals[issue.id],
    // Work: the current assignment, earlier ones (reassigned / completed), and every repair submission.
    assignment: current ? adminAssignmentView(current, now) : null,
    pastAssignments: assignments.filter((a) => a.endedAt).map((a) => adminAssignmentView(a, now)),
    submissions: submissions.map(adminSubmissionView),
    // Offered when assigning (OD-5); the admin sets the final deadline.
    suggestedDeadline: !current && issue.status === "ACKNOWLEDGED" ? suggestedDeadline(issue.priority, now) : null,
    deadlineDefaultsDays: deadlineDays(),
    ...feedback,
    possibleDuplicates: possible.map((p) => brief(p, distances[p.id])),
    duplicateOf: linkedTo ? brief(linkedTo) : null,
    linkedDuplicates: linkedHere.map((d) => brief(d)),
    history: history.map((h) => ({
      action: h.action,
      by: h.actor ? { id: h.actor.id, name: h.actor.name, role: h.actorRole } : null, // null = system
      reason: h.reason,
      details: h.metadata ?? {},
      at: h.createdAt,
    })),
  };
}
