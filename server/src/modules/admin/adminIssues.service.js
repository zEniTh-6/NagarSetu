// Admin issues table, dashboard counts and the extra parts of the review screen.
// Everything is limited to the admin's department.
import { departmentScope } from "../../auth/scope.js";
import { ACTIVE_STATUSES } from "../../geo/duplicates.js";
import { issueLocations, distancesFrom } from "../../geo/issues.js";
import { photoUrl } from "../issues/issues.views.js";
import { communitySignals } from "./community.js";

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

function listWhere(user, { status, category, flag, priority }) {
  const where = { ...departmentScope(user) };
  if (status === "ACTIVE") where.status = { in: ACTIVE_STATUSES };
  else if (status !== "ALL") where.status = status;
  if (category) where.category = { key: category };
  if (flag) where.flags = { some: { type: flag, clearedAt: null } };
  if (priority === "NONE") where.priority = null;
  else if (priority) where.priority = priority;
  return where;
}

/** The issues table. Default: reports waiting for review (REPORTED), newest first. */
export async function listAdminIssues(prisma, { user, page, pageSize, sort, ...filters }) {
  const where = listWhere(user, filters);
  const [total, issues] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.findMany({
      where,
      include: {
        category: true,
        flags: { where: { clearedAt: null }, orderBy: { createdAt: "asc" } },
        photos: { where: { kind: "ISSUE_ORIGINAL", replacedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
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
    })),
    page,
    pageSize,
    total,
  };
}

/** Dashboard counts for the admin's department. */
export async function adminDashboard(prisma, { user }) {
  const scope = departmentScope(user);
  const [byStatus, byFlag, needsPriority] = await Promise.all([
    prisma.issue.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.issueFlag.groupBy({
      by: ["type"],
      where: { clearedAt: null, issue: { ...scope, status: { in: ACTIVE_STATUSES } } },
      _count: { _all: true },
    }),
    prisma.issue.count({ where: { ...scope, status: { in: ["ACKNOWLEDGED", "IN_PROGRESS"] }, priority: null } }),
  ]);
  const statuses = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
  return {
    waitingForReview: statuses.REPORTED ?? 0,
    needsPriority,
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

  const [signals, possible, linkedTo, linkedHere, history] = await Promise.all([
    communitySignals(prisma, [issue.id]),
    flaggedIds.length ? prisma.issue.findMany({ where: { id: { in: flaggedIds }, ...scope }, include: { category: true } }) : [],
    issue.duplicateOfId ? prisma.issue.findFirst({ where: { id: issue.duplicateOfId, ...scope }, include: { category: true } }) : null,
    prisma.issue.findMany({ where: { duplicateOfId: issue.id, ...scope }, include: { category: true }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({
      where: { targetType: "ISSUE", targetId: issue.id },
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const distances = await distancesFrom(prisma, issue.id, possible.map((p) => p.id));

  return {
    community: signals[issue.id],
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
