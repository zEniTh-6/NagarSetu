// What any signed-in citizen may see about a PUBLIC issue (D-022, D-025): no reporter identity,
// no exact location (only the snapped point), no flags, AI results, priorities or deadlines.
import { photoUrl } from "../issues/issues.views.js";
import { APPROX_RADIUS_M } from "../../geo/public.js";

const PUBLIC_TIMELINE = new Set(["REPORTED", "ACKNOWLEDGED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REOPENED"]);

/** First word of the name only (D-025). */
export const firstName = (name) => (name ?? "").trim().split(/\s+/)[0] || "";

/** Public timeline: dates only, no reasons, no names. */
export const publicTimeline = (timeline) =>
  timeline.filter((e) => PUBLIC_TIMELINE.has(e.type)).map((e) => ({ type: e.type, at: e.at }));

/** A comment as citizens see it. Official replies are signed with the department's name. */
export function citizenCommentView(c, { userId, reportedIds = new Set() } = {}) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    official: c.isOfficial,
    author: c.isOfficial ? { department: c.author?.department?.name ?? null } : { firstName: firstName(c.author?.name) },
    mine: c.authorId === userId,
    reportedByMe: reportedIds.has(c.id),
  };
}

/** A comment as the department admin sees it: hidden ones too, with who hid it and the reports. */
export function adminCommentView(c) {
  const byReason = {};
  for (const r of c.reports ?? []) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  return {
    id: c.id,
    issueId: c.issueId,
    body: c.body,
    createdAt: c.createdAt,
    official: c.isOfficial,
    author: { id: c.authorId, name: c.author?.name ?? null, role: c.author?.role ?? null, status: c.author?.status ?? null, department: c.author?.department?.name ?? null },
    hidden: c.hiddenAt ? { at: c.hiddenAt, reason: c.hiddenReason, by: c.hiddenBy ? { id: c.hiddenBy.id, name: c.hiddenBy.name } : null } : null,
    reports: { total: c.reports?.length ?? 0, byReason, notes: (c.reports ?? []).filter((r) => r.note).map((r) => ({ reason: r.reason, note: r.note, at: r.createdAt })) },
  };
}

/**
 * One public issue (feed card or public detail).
 * @param {object} parts { approx, photo, repairPhoto, counts, viewer, latestReply, timeline }
 */
export function publicIssueView(issue, { approx, photo, repairPhoto, counts, viewer, latestReply, timeline }) {
  return {
    id: issue.id,
    visibility: "PUBLIC",
    status: issue.status,
    category: { key: issue.category.key, name: issue.category.name },
    description: issue.description,
    areaName: issue.areaName ?? null,
    approxLocation: approx ? { ...approx, radiusM: APPROX_RADIUS_M } : null,
    photo: photo ? { id: photo.id, url: photoUrl(photo.id) } : null,
    createdAt: issue.createdAt,
    ...(issue.status === "RESOLVED"
      ? { resolution: { resolvedAt: issue.resolvedAt, photo: repairPhoto ? { id: repairPhoto.id, url: photoUrl(repairPhoto.id) } : null } }
      : {}),
    community: { upvotes: counts?.upvotes ?? 0, supporters: counts?.supporters ?? 0, comments: counts?.comments ?? 0 },
    viewer,
    latestOfficialReply: latestReply ? citizenCommentView(latestReply) : null,
    ...(timeline ? { timeline: publicTimeline(timeline) } : {}),
  };
}
