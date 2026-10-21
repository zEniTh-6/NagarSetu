// Citizen reports: create, retake photo, withdraw, list "my complaints", read one issue.
import crypto from "node:crypto";
import { AppError } from "../../lib/AppError.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { insertIssue, issueLocations } from "../../geo/issues.js";
import { processPhoto } from "../../images/processPhoto.js";
import { env } from "../../config/env.js";
import { addFlag, FLAG_REASON } from "./flags.js";
import { assertInServiceArea, classifyGps } from "./location.js";
import { citizenIssueView, adminIssueView, resolutionView } from "./issues.views.js";
import { validCandidateIds, duplicateReason } from "./duplicates.service.js";
import { adminReviewExtras } from "../admin/adminIssues.service.js";
import { isFollower, citizenFeedbackState } from "../feedback/feedback.service.js";
import { queueAreaLookup } from "../feed/areaName.service.js";
import { completedJobOn } from "../work/contractorWork.service.js";
import { publicIssueDetails, followerCommunity } from "../feed/feed.service.js";
import { isPublic } from "../feed/visibility.js";
import { approximateLocations, APPROX_RADIUS_M } from "../../geo/public.js";

/**
 * The exact spot and the typed address are for the reporter, the admin and the assigned contractor
 * only (brief). Supporters get the approximate area, like everyone else (D-025).
 */
function withoutExactLocation(view, approx) {
  const { location: _location, addressText: _addressText, ...rest } = view;
  return { ...rest, approxLocation: approx ? { ...approx, radiusM: APPROX_RADIUS_M } : null };
}

const notFound = () => new AppError(404, "NOT_FOUND", "Not found");
const actorOf = (u) => ({ id: u.id, role: u.role });

const ISSUE_INCLUDE = { category: true, aiSuggestedCategory: true };
const currentPhotoWhere = { kind: "ISSUE_ORIGINAL", replacedAt: null };

async function currentPhoto(db, issueId) {
  return db.photo.findFirst({ where: { issueId, ...currentPhotoWhere }, orderBy: { createdAt: "desc" } });
}

async function storePhoto(storage, issueId, photoId, processed) {
  const originalKey = `issues/${issueId}/${photoId}-original.${processed.ext}`;
  const publicKey = `issues/${issueId}/${photoId}-public.jpg`;
  await storage.put(originalKey, processed.original, processed.mimeType);
  await storage.put(publicKey, processed.public, "image/jpeg");
  return { originalKey, publicKey };
}

function photoData(processed, keys, { issueId, photoId, uploadedById, capturedAt }) {
  return {
    id: photoId,
    kind: "ISSUE_ORIGINAL",
    issueId,
    uploadedById,
    originalKey: keys.originalKey,
    publicKey: keys.publicKey,
    mimeType: processed.mimeType,
    width: processed.width,
    height: processed.height,
    sizeBytes: processed.sizeBytes,
    sha256: processed.sha256,
    capturedAt: capturedAt ?? null,
  };
}

async function citizenView(db, issueId) {
  const issue = await db.issue.findUnique({ where: { id: issueId }, include: ISSUE_INCLUDE });
  const [locations, photo] = await Promise.all([issueLocations(db, [issueId]), currentPhoto(db, issueId)]);
  return citizenIssueView(issue, locations[issueId], photo);
}

/**
 * Creates a report. A retry with the same clientRequestId returns the first issue (created=false).
 * The photo check runs in the background job; the response says "CHECKING".
 */
export async function createIssue(prisma, { user, input, file, storage, jobs, serviceArea = env.SERVICE_AREA_BBOX }) {
  // Retry of an earlier request? Answer with that issue and do nothing else.
  const earlier = await prisma.issue.findUnique({
    where: { reporterId_clientRequestId: { reporterId: user.id, clientRequestId: input.clientRequestId } },
    select: { id: true },
  });
  if (earlier) return { created: false, issue: await citizenView(prisma, earlier.id) };

  if (!file) throw new AppError(400, "PHOTO_REQUIRED", "Add a photo of the problem");
  assertInServiceArea(input, serviceArea);

  const category = await prisma.category.findUnique({ where: { key: input.categoryKey } });
  if (!category || !category.active) throw new AppError(400, "UNKNOWN_CATEGORY", "Unknown category");

  const processed = await processPhoto(file.buffer);
  const issueId = crypto.randomUUID();
  const photoId = crypto.randomUUID();
  // Files are written first; if the database step then fails they are left unused (harmless).
  const keys = await storePhoto(storage, issueId, photoId, processed);

  const result = await prisma.$transaction(async (tx) => {
    const row = await insertIssue(tx, {
      id: issueId,
      reporterId: user.id,
      clientRequestId: input.clientRequestId,
      categoryId: category.id,
      departmentId: category.departmentId,
      description: input.description,
      lat: input.lat,
      lng: input.lng,
      addressText: input.addressText,
      deviceLat: input.deviceLat,
      deviceLng: input.deviceLng,
      deviceAccuracyM: input.deviceAccuracyM,
    });
    if (!row.created) return { created: false, id: row.id }; // lost a race with an identical retry

    await tx.photo.create({
      data: photoData(processed, keys, { issueId, photoId, uploadedById: user.id, capturedAt: input.capturedAt }),
    });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.ISSUE_CREATED,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      metadata: { category: category.key, departmentId: category.departmentId, status: "REPORTED" },
    });

    // The citizen saw similar reports in the duplicate popup and still chose to file a new one.
    const declined = await validCandidateIds(tx, { ids: input.duplicateCandidateIds, categoryId: category.id });
    if (declined.length) {
      await addFlag(tx, { issueId, type: "POSSIBLE_DUPLICATE", reason: duplicateReason(declined, "declined") });
    }

    const gps = classifyGps({ distanceM: row.gpsDistanceM, accuracyM: input.deviceAccuracyM });
    if (gps === "SUSPICIOUS") {
      await addFlag(tx, {
        issueId,
        type: "SUSPICIOUS",
        reason: FLAG_REASON.GPS_MISMATCH,
        detail: `${Math.round(row.gpsDistanceM)} m apart, GPS accuracy ${Math.round(input.deviceAccuracyM)} m`,
      });
    }
    return { created: true, id: issueId };
  });

  if (result.created) {
    await queueCheck(jobs, { issueId, photoId });
    await queueEmbedding(jobs, issueId);
    await queueAreaLookup(jobs, issueId);
  }
  return { created: result.created, issue: await citizenView(prisma, result.id) };
}

async function queueCheck(jobs, data) {
  try {
    await jobs.enqueuePhotoValidation(data);
  } catch (err) {
    // The start-up sweep queues it later; the report itself is safe.
    console.error("Could not queue the photo check:", err);
  }
}

async function queueEmbedding(jobs, issueId) {
  try {
    await jobs.enqueueEmbedding({ issueId });
  } catch (err) {
    console.error("Could not queue the embedding:", err);
  }
}

async function ownIssue(prisma, user, issueId) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue || issue.reporterId !== user.id) throw notFound();
  return issue;
}

/** The citizen retakes the photo after the AI asked for it (INVALID). The old photo is kept. */
export async function retakePhoto(prisma, { user, issueId, file, capturedAt, storage, jobs, now = new Date() }) {
  const issue = await ownIssue(prisma, user, issueId);
  if (issue.status !== "REPORTED" || issue.aiVerdict !== "INVALID") {
    throw new AppError(409, "RETAKE_NOT_REQUESTED", "A new photo is only needed when we ask for one");
  }
  if (!file) throw new AppError(400, "PHOTO_REQUIRED", "Add a photo of the problem");

  const processed = await processPhoto(file.buffer);
  const photoId = crypto.randomUUID();
  const keys = await storePhoto(storage, issueId, photoId, processed);

  await prisma.$transaction(async (tx) => {
    const old = await tx.photo.updateMany({ where: { issueId, ...currentPhotoWhere }, data: { replacedAt: now } });
    await tx.photo.create({ data: photoData(processed, keys, { issueId, photoId, uploadedById: user.id, capturedAt }) });
    await tx.issue.update({
      where: { id: issueId },
      data: {
        aiVerdict: null,
        aiVerdictReason: null,
        aiRiskLevel: null,
        aiRiskReason: null,
        aiSuggestedCategoryId: null,
        aiCheckedAt: null,
        aiAttempts: 0,
      },
    });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.ISSUE_PHOTO_REPLACED,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      reason: "Citizen retook the photo after the AI asked for it",
      metadata: { newPhotoId: photoId, replacedPhotos: old.count },
    });
  });

  await queueCheck(jobs, { issueId, photoId });
  return citizenView(prisma, issueId);
}

/** Reporter only, and only before the admin has acknowledged it. */
export async function withdrawIssue(prisma, { user, issueId, reason }) {
  const issue = await ownIssue(prisma, user, issueId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.issue.updateMany({
      where: { id: issue.id, status: "REPORTED" },
      data: { status: "WITHDRAWN", statusReason: reason ?? null },
    });
    if (count !== 1) throw new AppError(409, "CANNOT_WITHDRAW", "Only reports that are not yet acknowledged can be withdrawn");
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.ISSUE_STATUS_CHANGED,
      targetType: AuditTarget.ISSUE,
      targetId: issue.id,
      reason: reason ?? "Withdrawn by the reporter",
      metadata: { from: "REPORTED", to: "WITHDRAWN" },
    });
  });
  return citizenView(prisma, issue.id);
}

/** "My complaints", newest first. */
export async function listMyIssues(prisma, { user, page, pageSize }) {
  const where = { reporterId: user.id };
  const [total, issues] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.findMany({
      where,
      include: { ...ISSUE_INCLUDE, photos: { where: currentPhotoWhere, orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const locations = await issueLocations(prisma, issues.map((i) => i.id));
  return {
    items: issues.map((i) => citizenIssueView(i, locations[i.id], i.photos[0])),
    page,
    pageSize,
    total,
  };
}

/** Issues the citizen supports (duplicate popup "yes", support button, or linked by an admin), newest support first. */
export async function listSupportedIssues(prisma, { user, page, pageSize }) {
  const [total, rows] = await Promise.all([
    prisma.issueSupporter.count({ where: { userId: user.id } }),
    prisma.issueSupporter.findMany({
      where: { userId: user.id },
      include: { issue: { include: { ...ISSUE_INCLUDE, photos: { where: currentPhotoWhere, orderBy: { createdAt: "desc" }, take: 1 } } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const issues = rows.map((r) => r.issue);
  const approx = await approximateLocations(prisma, issues.map((i) => i.id));
  return {
    items: rows.map((r) =>
      withoutExactLocation(citizenIssueView(r.issue, null, r.issue.photos[0], { supportedAt: r.createdAt, areaName: r.issue.areaName ?? null }), approx[r.issue.id]),
    ),
    page,
    pageSize,
    total,
  };
}

// Audit actions that make up the citizen's timeline. Internal steps (flags, priority, deadlines,
// submissions, contractor identity) are never included.
const TIMELINE_ACTIONS = [
  AuditAction.ISSUE_CREATED,
  AuditAction.ISSUE_STATUS_CHANGED,
  AuditAction.ISSUE_LINKED_DUPLICATE,
  AuditAction.ISSUE_REROUTED,
  AuditAction.ASSIGNMENT_CREATED,
  AuditAction.ISSUE_REOPENED,
];

/** One audit row → one citizen timeline entry (or null). Only reasons written for the citizen are passed on. */
function timelineEntry(row) {
  const at = row.createdAt;
  const m = row.metadata ?? {};
  switch (row.action) {
    case AuditAction.ISSUE_CREATED:
      return { type: "REPORTED", at };
    case AuditAction.ISSUE_STATUS_CHANGED:
      if (m.to === "REJECTED") return { type: "REJECTED", at, rejectionType: m.rejectionType ?? null, reason: row.reason ?? null };
      if (["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "WITHDRAWN"].includes(m.to)) return { type: m.to, at };
      return null;
    case AuditAction.ISSUE_LINKED_DUPLICATE:
      return { type: "DUPLICATE", at, duplicateOfId: m.duplicateOfId ?? null, reason: row.reason ?? null };
    case AuditAction.ISSUE_REROUTED:
      return { type: "REROUTED", at, fromCategory: m.fromCategory ?? null, toCategory: m.toCategory ?? null, reason: row.reason ?? null };
    case AuditAction.ASSIGNMENT_CREATED:
      return { type: "ASSIGNED", at };
    case AuditAction.ISSUE_REOPENED:
      return { type: "REOPENED", at, reason: row.reason ?? null };
    default:
      return null;
  }
}

/** What happened to an issue, oldest first, built from the audit log (citizen-safe). */
export async function citizenTimeline(db, issueId) {
  const rows = await db.auditLog.findMany({
    where: { targetType: AuditTarget.ISSUE, targetId: issueId, action: { in: TIMELINE_ACTIONS } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(timelineEntry).filter(Boolean);
}

/**
 * One issue.
 *   - admin of the issue's department → admin view;
 *   - its reporter or a supporter → citizen view (exact location, timeline with reasons, feedback);
 *   - any other citizen → public view, only if the issue is public (D-022): no reporter, approximate
 *     location (D-025);
 *   - everyone else → 404 (same as a missing issue). Contractors use /api/contractor.
 */
export async function getIssue(prisma, { user, issueId }) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { ...ISSUE_INCLUDE, reporter: true, flags: { where: { clearedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  if (!issue) throw notFound();
  const isAdmin = user.role === "ADMIN" && user.departmentId === issue.departmentId;
  if (isAdmin) {
    const [locations, photo] = await Promise.all([issueLocations(prisma, [issue.id]), currentPhoto(prisma, issue.id)]);
    return adminIssueView(issue, locations[issue.id], photo, await adminReviewExtras(prisma, { user, issue }));
  }
  if (user.role !== "CITIZEN") throw notFound();

  if (!(await isFollower(prisma, user, issue))) {
    const view = isPublic(issue) ? await publicIssueDetails(prisma, { user, issue, timeline: await citizenTimeline(prisma, issue.id) }) : null;
    if (!view) throw notFound();
    return view;
  }

  const isReporter = issue.reporterId === user.id;
  const [locations, photo] = await Promise.all([
    isReporter ? issueLocations(prisma, [issue.id]) : approximateLocations(prisma, [issue.id]),
    currentPhoto(prisma, issue.id),
  ]);
  const view = citizenIssueView(issue, isReporter ? locations[issue.id] : null, photo, {
    visibility: "FOLLOWER",
    ...resolutionView(issue, await approvedRepairPhoto(prisma, issue.id)),
    ...(await citizenFeedbackState(prisma, user, issue)),
    ...(await followerCommunity(prisma, { user, issue })),
    timeline: await citizenTimeline(prisma, issue.id),
    // Only the reporter may withdraw; supporters follow the outcome.
    relation: isReporter ? "REPORTER" : "SUPPORTER",
  });
  return isReporter ? view : withoutExactLocation(view, locations[issue.id]);
}

/** The published repair photo: the one from the approved submission. */
function approvedRepairPhoto(db, issueId) {
  return db.photo.findFirst({
    where: { issueId, kind: "REPAIR_EVIDENCE", repairSubmission: { status: "APPROVED" } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Photo bytes. Originals (may have EXIF/GPS): department admin only. Public copies:
 *   - department admin: every photo of the issue;
 *   - reporter and supporters: the report photo, and a repair photo only once the admin approved it
 *     (published); a feedback photo only to the citizen who added it;
 *   - any other citizen, when the issue is public (D-022): its current report photo, and the
 *     approved repair photo once it is RESOLVED;
 *   - contractor: while assigned (or after their evidence was approved), the report photo and their
 *     own repair photos.
 * Everyone else: 404.
 */
export async function getPhotoFile(prisma, { user, photoId, variant, storage }) {
  const photo = await prisma.photo.findUnique({ where: { id: photoId }, include: { issue: true, repairSubmission: true } });
  if (!photo) throw notFound();
  const isAdmin = user.role === "ADMIN" && user.departmentId === photo.issue.departmentId;
  if (!isAdmin && !(variant === "public" && (await canSeePublicCopy(prisma, user, photo)))) throw notFound();

  const key = variant === "original" ? photo.originalKey : photo.publicKey;
  let buffer;
  try {
    buffer = await storage.get(key);
  } catch (err) {
    if (err.code === "NOT_FOUND") throw notFound();
    throw err;
  }
  return { buffer, contentType: variant === "original" ? photo.mimeType : "image/jpeg" };
}

async function canSeePublicCopy(db, user, photo) {
  if (user.role === "CITIZEN") {
    if (photo.kind === "FEEDBACK") return photo.uploadedById === user.id;
    if (await isFollower(db, user, photo.issue)) return photo.kind === "ISSUE_ORIGINAL" || photo.repairSubmission?.status === "APPROVED";
    if (!isPublic(photo.issue)) return false;
    if (photo.kind === "ISSUE_ORIGINAL") return !photo.replacedAt;
    return photo.issue.status === "RESOLVED" && photo.repairSubmission?.status === "APPROVED";
  }
  if (user.role === "CONTRACTOR") {
    // While assigned, or (read-only) after their own evidence was approved (D-027).
    const assigned = await db.assignment.count({ where: { issueId: photo.issueId, contractorId: user.id, endedAt: null } });
    const ok = assigned > 0 || (await completedJobOn(db, user, photo.issueId));
    return ok && (photo.kind === "ISSUE_ORIGINAL" || photo.uploadedById === user.id);
  }
  return false;
}

export async function listCategories(prisma) {
  const cats = await prisma.category.findMany({ where: { active: true }, include: { department: true }, orderBy: { name: "asc" } });
  return cats.map((c) => ({ key: c.key, name: c.name, department: { code: c.department.code, name: c.department.name } }));
}
