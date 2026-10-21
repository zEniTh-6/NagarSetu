// Contractor side: see assigned jobs, start work, submit repair evidence.
// A contractor only ever sees issues currently assigned to them, plus (read-only) jobs they
// completed: their own evidence was approved (D-027). Anything else answers 404.
// A contractor can never set RESOLVED: only an admin approving a submission does.
import crypto from "node:crypto";
import { AppError } from "../../lib/AppError.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { issueLocations, distanceToIssue } from "../../geo/issues.js";
import { processPhoto } from "../../images/processPhoto.js";
import { env } from "../../config/env.js";
import { addFlag, FLAG_REASON } from "../issues/flags.js";
import { GPS_RULES } from "../issues/location.js";
import { notifyIssueFollowers } from "../notifications/notifications.service.js";
import { pauseData } from "./deadline.js";
import { contractorJobView } from "./work.views.js";

const notFound = () => new AppError(404, "NOT_FOUND", "Not found");
const actorOf = (u) => ({ id: u.id, role: u.role });

/**
 * Repair photo GPS vs the issue location. GPS mismatch is never proof of anything:
 *   NONE (no device location) and MILD (poor accuracy) are recorded only;
 *   SUSPICIOUS (good accuracy, far away) adds a flag for the admin. Nothing is rejected.
 */
export function classifyRepairGps({ distanceM, accuracyM }, extraM = env.REPAIR_GPS_EXTRA_M) {
  if (distanceM == null) return "NONE";
  const accuracy = accuracyM ?? Infinity;
  if (accuracy <= GPS_RULES.goodAccuracyM) return distanceM > accuracy + extraM ? "SUSPICIOUS" : "OK";
  return distanceM > GPS_RULES.goodAccuracyM + extraM ? "MILD" : "OK";
}

const JOB_INCLUDE = {
  department: { select: { name: true } },
  issue: { include: { category: true, photos: { where: { kind: "ISSUE_ORIGINAL", replacedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } } },
  submissions: { include: { photos: true }, orderBy: { createdAt: "asc" } },
};

/** The contractor's current assignment for this issue, or 404. */
async function myAssignment(db, user, issueId) {
  const a = await db.assignment.findFirst({ where: { issueId, contractorId: user.id, endedAt: null }, include: JOB_INCLUDE });
  if (!a) throw notFound();
  return a;
}

async function jobView(db, assignment, now) {
  const locations = await issueLocations(db, [assignment.issueId]);
  return contractorJobView(assignment, locations[assignment.issueId], now);
}

/** Ended assignments that count as the contractor's completed work: their evidence was approved. */
const completedWhere = (user) => ({ contractorId: user.id, endedAt: { not: null }, submissions: { some: { status: "APPROVED" } } });

/**
 * state=active: my current jobs, nearest effective deadline first.
 * state=completed: jobs whose repair I did and the admin approved, newest first (paged).
 */
export async function listMyJobs(prisma, { user, state = "active", page = 1, pageSize = 50, now = new Date() }) {
  if (state === "completed") {
    const where = completedWhere(user);
    const [total, assignments] = await Promise.all([
      prisma.assignment.count({ where }),
      prisma.assignment.findMany({ where, include: JOB_INCLUDE, orderBy: { endedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const locations = await issueLocations(prisma, assignments.map((a) => a.issueId));
    return { items: assignments.map((a) => contractorJobView(a, locations[a.issueId], now)), page, pageSize, total };
  }
  const assignments = await prisma.assignment.findMany({ where: { contractorId: user.id, endedAt: null }, include: JOB_INCLUDE });
  const locations = await issueLocations(prisma, assignments.map((a) => a.issueId));
  const items = assignments.map((a) => contractorJobView(a, locations[a.issueId], now));
  items.sort((x, y) => x.deadline.effectiveDeadline - y.deadline.effectiveDeadline);
  return { items };
}

/** My current job for this issue, or (read-only) the one I completed most recently; else 404. */
export async function getMyJob(prisma, { user, issueId, now = new Date() }) {
  const current = await prisma.assignment.findFirst({ where: { issueId, contractorId: user.id, endedAt: null }, include: JOB_INCLUDE });
  if (current) return jobView(prisma, current, now);
  const done = await prisma.assignment.findFirst({ where: { issueId, ...completedWhere(user) }, include: JOB_INCLUDE, orderBy: { endedAt: "desc" } });
  if (!done) throw notFound();
  return jobView(prisma, done, now);
}

/** Has this contractor completed (approved evidence) a job on this issue? Used for photo access. */
export async function completedJobOn(db, user, issueId) {
  return (await db.assignment.count({ where: { issueId, ...completedWhere(user) } })) > 0;
}

/** The contractor's own details for the profile (changes go through an admin). */
export async function myProfile(prisma, { user }) {
  const [me, active, completed] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.assignment.count({ where: { contractorId: user.id, endedAt: null } }),
    prisma.assignment.count({ where: completedWhere(user) }),
  ]);
  return {
    id: me.id,
    name: me.name,
    email: me.email,
    phone: me.phone,
    workType: me.workType,
    licenceNumber: me.licenceNumber,
    activeJobs: active,
    completedJobs: completed,
  };
}

/**
 * Start work: ACKNOWLEDGED → IN_PROGRESS (reporter and supporters are told). After a reassignment
 * the issue may already be IN_PROGRESS; then only this assignment is marked started.
 */
export async function startWork(prisma, { user, issueId, now = new Date() }) {
  const assignment = await myAssignment(prisma, user, issueId);
  if (assignment.startedAt) throw new AppError(409, "ALREADY_STARTED", "Work has already started");

  await prisma.$transaction(async (tx) => {
    const started = await tx.assignment.updateMany({ where: { id: assignment.id, startedAt: null, endedAt: null }, data: { startedAt: now } });
    if (started.count !== 1) throw new AppError(409, "ALREADY_STARTED", "Work has already started");
    const moved = await tx.issue.updateMany({ where: { id: issueId, status: "ACKNOWLEDGED" }, data: { status: "IN_PROGRESS" } });
    if (moved.count === 1) {
      await writeAudit(tx, {
        actor: actorOf(user),
        action: AuditAction.ISSUE_STATUS_CHANGED,
        targetType: AuditTarget.ISSUE,
        targetId: issueId,
        reason: "Contractor started work",
        metadata: { from: "ACKNOWLEDGED", to: "IN_PROGRESS", assignmentId: assignment.id },
      });
      await notifyIssueFollowers(tx, { issueId, type: "IN_PROGRESS", params: {} });
    }
  });
  return getMyJob(prisma, { user, issueId, now });
}

/**
 * Submit repair evidence. Safe to retry: the same clientRequestId returns the first submission
 * (the original capture time is kept). Pauses the deadline clock until the admin reviews it.
 * The issue stays IN_PROGRESS.
 */
export async function submitRepair(prisma, { user, issueId, input, file, storage, jobs, now = new Date() }) {
  const earlier = await prisma.repairSubmission.findUnique({
    where: { contractorId_clientRequestId: { contractorId: user.id, clientRequestId: input.clientRequestId } },
  });
  if (earlier) {
    if (earlier.issueId !== issueId) throw new AppError(409, "REQUEST_ID_REUSED", "This request ID was used for another job");
    return { created: false, job: await getMyJob(prisma, { user, issueId, now }) };
  }

  const assignment = await myAssignment(prisma, user, issueId);
  if (assignment.issue.status !== "IN_PROGRESS" || !assignment.startedAt) {
    throw new AppError(409, "NOT_STARTED", "Start the work before submitting repair evidence");
  }
  if (assignment.submissions.some((s) => s.status === "SUBMITTED")) {
    throw new AppError(409, "SUBMISSION_PENDING", "Your last submission is still being reviewed");
  }
  if (!file) throw new AppError(400, "PHOTO_REQUIRED", "Add a photo of the repair");

  const processed = await processPhoto(file.buffer);
  const submissionId = crypto.randomUUID();
  const photoId = crypto.randomUUID();
  const originalKey = `issues/${issueId}/repairs/${photoId}-original.${processed.ext}`;
  const publicKey = `issues/${issueId}/repairs/${photoId}-public.jpg`;
  await storage.put(originalKey, processed.original, processed.mimeType);
  await storage.put(publicKey, processed.public, "image/jpeg");

  const hasGps = input.deviceLat != null && input.deviceLng != null;
  const distanceM = hasGps ? await distanceToIssue(prisma, issueId, { lat: input.deviceLat, lng: input.deviceLng }) : null;

  let created = true;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.repairSubmission.create({
        data: {
          id: submissionId,
          issueId,
          assignmentId: assignment.id,
          contractorId: user.id,
          clientRequestId: input.clientRequestId,
          note: input.note ?? null,
          capturedAt: input.capturedAt ?? null,
          captureSource: input.captureSource ?? null,
          deviceLat: input.deviceLat ?? null,
          deviceLng: input.deviceLng ?? null,
          deviceAccuracyM: input.deviceAccuracyM ?? null,
          gpsDistanceM: distanceM,
        },
      });
      await tx.photo.create({
        data: {
          id: photoId,
          kind: "REPAIR_EVIDENCE",
          issueId,
          repairSubmissionId: submissionId,
          uploadedById: user.id,
          originalKey,
          publicKey,
          mimeType: processed.mimeType,
          width: processed.width,
          height: processed.height,
          sizeBytes: processed.sizeBytes,
          sha256: processed.sha256,
          capturedAt: input.capturedAt ?? null,
        },
      });
      await tx.assignment.update({ where: { id: assignment.id }, data: pauseData(assignment, now) });
      await writeAudit(tx, {
        actor: actorOf(user),
        action: AuditAction.SUBMISSION_CREATED,
        targetType: AuditTarget.ISSUE,
        targetId: issueId,
        metadata: {
          submissionId,
          assignmentId: assignment.id,
          gpsDistanceM: distanceM == null ? null : Math.round(distanceM),
          captureSource: input.captureSource ?? null,
        },
      });
      if (classifyRepairGps({ distanceM, accuracyM: input.deviceAccuracyM }) === "SUSPICIOUS") {
        await addFlag(tx, {
          issueId,
          type: "SUSPICIOUS",
          reason: FLAG_REASON.REPAIR_GPS_MISMATCH,
          detail: `${Math.round(distanceM)} m away, GPS accuracy ${Math.round(input.deviceAccuracyM)} m`,
          actor: null,
        });
      }
    });
  } catch (err) {
    // A retry raced the first upload (same request ID), or two uploads at once (one pending allowed).
    if (err?.code !== "P2002") throw err;
    const same = await prisma.repairSubmission.findUnique({
      where: { contractorId_clientRequestId: { contractorId: user.id, clientRequestId: input.clientRequestId } },
    });
    if (!same) throw new AppError(409, "SUBMISSION_PENDING", "Your last submission is still being reviewed");
    created = false;
  }

  if (created) {
    try {
      await jobs.enqueueRepairValidation({ submissionId });
    } catch (err) {
      console.error("Could not queue the repair check:", err); // the start-up sweep queues it later
    }
  }
  return { created, job: await getMyJob(prisma, { user, issueId, now }) };
}
