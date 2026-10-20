// Public feed, public map and the public issue view (D-022, D-025). Signed-in citizens only.
import { approximateLocations, pinsInBox } from "../../geo/public.js";
import { publicWhere, publicSql, isPublic } from "./visibility.js";
import { publicIssueView, publicTimeline } from "./feed.views.js";

const CURRENT_PHOTO = { where: { kind: "ISSUE_ORIGINAL", replacedAt: null }, orderBy: { createdAt: "desc" }, take: 1 };
const REPLY_AUTHOR = { select: { name: true, department: { select: { name: true } } } };

const byIssue = (rows) => Object.fromEntries(rows.map((r) => [r.issueId, r._count._all]));

/** { issueId → { upvotes, supporters, comments } }; comments = what citizens can see (not hidden). */
export async function publicCounts(db, ids) {
  if (!ids.length) return {};
  const where = { issueId: { in: ids } };
  const [up, sup, com] = await Promise.all([
    db.upvote.groupBy({ by: ["issueId"], where, _count: { _all: true } }),
    db.issueSupporter.groupBy({ by: ["issueId"], where, _count: { _all: true } }),
    db.comment.groupBy({ by: ["issueId"], where: { ...where, hiddenAt: null }, _count: { _all: true } }),
  ]);
  const [u, s, c] = [byIssue(up), byIssue(sup), byIssue(com)];
  return Object.fromEntries(ids.map((id) => [id, { upvotes: u[id] ?? 0, supporters: s[id] ?? 0, comments: c[id] ?? 0 }]));
}

/** What the signed-in citizen has to do with each issue: { upvoted, relation: REPORTER|SUPPORTER|null }. */
export async function viewerStates(db, user, issues) {
  const ids = issues.map((i) => i.id);
  if (!ids.length) return {};
  const [ups, sups] = await Promise.all([
    db.upvote.findMany({ where: { userId: user.id, issueId: { in: ids } }, select: { issueId: true } }),
    db.issueSupporter.findMany({ where: { userId: user.id, issueId: { in: ids } }, select: { issueId: true } }),
  ]);
  const upvoted = new Set(ups.map((u) => u.issueId));
  const supporting = new Set(sups.map((s) => s.issueId));
  return Object.fromEntries(
    issues.map((i) => [
      i.id,
      { upvoted: upvoted.has(i.id), relation: i.reporterId === user.id ? "REPORTER" : supporting.has(i.id) ? "SUPPORTER" : null },
    ]),
  );
}

/** The newest official reply per issue. */
export async function latestOfficialReplies(db, ids) {
  if (!ids.length) return {};
  const rows = await db.comment.findMany({
    where: { issueId: { in: ids }, isOfficial: true, hiddenAt: null },
    include: { author: REPLY_AUTHOR },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["issueId"],
  });
  return Object.fromEntries(rows.map((r) => [r.issueId, r]));
}

async function publicCards(db, user, issues) {
  const ids = issues.map((i) => i.id);
  const [approx, counts, viewer, replies, repairs] = await Promise.all([
    approximateLocations(db, ids),
    publicCounts(db, ids),
    viewerStates(db, user, issues),
    latestOfficialReplies(db, ids),
    approvedRepairPhotos(db, issues.filter((i) => i.status === "RESOLVED").map((i) => i.id)),
  ]);
  return issues.map((i) =>
    publicIssueView(i, { approx: approx[i.id], photo: i.photos?.[0], repairPhoto: repairs[i.id], counts: counts[i.id], viewer: viewer[i.id], latestReply: replies[i.id] }),
  );
}

async function approvedRepairPhotos(db, ids) {
  if (!ids.length) return {};
  const rows = await db.photo.findMany({
    where: { issueId: { in: ids }, kind: "REPAIR_EVIDENCE", repairSubmission: { status: "APPROVED" } },
    orderBy: { createdAt: "desc" },
    distinct: ["issueId"],
  });
  return Object.fromEntries(rows.map((r) => [r.issueId, r]));
}

/** GET /api/feed — public issues, newest first, optionally one category. */
export async function listFeed(prisma, { user, category, page, pageSize }) {
  const where = publicWhere(category ? { category: { key: category } } : {});
  const [total, issues] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.findMany({
      where,
      include: { category: true, photos: CURRENT_PHOTO },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: await publicCards(prisma, user, issues), page, pageSize, total };
}

/** GET /api/feed/map — snapped pins inside the box (capped). */
export async function mapPins(prisma, { bbox, category }) {
  let categoryId;
  if (category) {
    const row = await prisma.category.findUnique({ where: { key: category }, select: { id: true } });
    if (!row) return { pins: [], truncated: false };
    categoryId = row.id;
  }
  const { pins, truncated } = await pinsInBox(prisma, { bbox, publicFilter: publicSql({ categoryId }) });
  if (!pins.length) return { pins, truncated };
  const rows = await prisma.issue.findMany({
    where: { id: { in: pins.map((p) => p.id) } },
    select: { id: true, status: true, category: { select: { key: true } } },
  });
  const info = Object.fromEntries(rows.map((r) => [r.id, r]));
  return {
    pins: pins.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, category: info[p.id]?.category.key ?? null, status: info[p.id]?.status ?? null })),
    truncated,
  };
}

/**
 * Public view of one issue for a citizen who is not its reporter or supporter. Returns null when the
 * issue is not public (the caller answers 404, same as a missing issue).
 */
export async function publicIssueDetails(prisma, { user, issue, timeline }) {
  if (!isPublic(issue)) return null;
  const photos = await prisma.photo.findMany({ where: { issueId: issue.id, ...CURRENT_PHOTO.where }, orderBy: CURRENT_PHOTO.orderBy, take: 1 });
  const [card] = await publicCards(prisma, user, [{ ...issue, photos }]);
  return { ...card, timeline: publicTimeline(timeline) };
}

/** Extra fields for the reporter's / supporter's own view, so it can show upvotes and comments too. */
export async function followerCommunity(prisma, { user, issue }) {
  const [counts, viewer] = await Promise.all([publicCounts(prisma, [issue.id]), viewerStates(prisma, user, [issue])]);
  return { public: isPublic(issue), areaName: issue.areaName ?? null, community: counts[issue.id], viewer: viewer[issue.id] };
}
