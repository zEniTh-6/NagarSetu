// Contractor side: see assigned jobs, start work, submit repair evidence.
// A contractor only ever sees issues currently assigned to them (anything else answers 404),
// and can never set RESOLVED: only an admin approving a submission does.
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

/** My current jobs, nearest effective deadline first. */
export async function listMyJobs(prisma, { user, now = new Date() }) {
  const assignments = await prisma.assignment.findMany({ where: { contractorId: user.id, endedAt: null }, include: JOB_INCLUDE });
  const locations = await issueLocations(prisma, assignments.map((a) => a.issueId));
  const items = assignments.map((a) => contractorJobView(a, locations[a.issueId], now));
  items.sort((x, y) => x.deadline.effectiveDeadline - y.deadline.effectiveDeadline);
  return { items };
}

export async function getMyJob(prisma, { user, issueId, now = new Date() }) {
  return jobView(prisma, await myAssignment(prisma, user, issueId), now);
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
        metadata: { submissionId, assignmentId: assignment.id, gpsDistanceM: distanceM == null ? null : Math.round(distanceM) },
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
