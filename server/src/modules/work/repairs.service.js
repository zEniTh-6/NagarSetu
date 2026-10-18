// Repair evidence: the background AI check, and the admin's approve / reject.
// The AI only suggests. Approve is the ONLY way an issue becomes RESOLVED.
import { AppError } from "../../lib/AppError.js";
import { assertInDepartment } from "../../auth/scope.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { notifyIssueFollowers } from "../notifications/notifications.service.js";
import { resumeData } from "./deadline.js";
import { clearEscalation } from "./escalation.service.js";

/** First try + 5 retries (pg-boss retryLimit = MAX - 1), like the report photo check. */
export const MAX_REPAIR_CHECK_ATTEMPTS = 6;

const actorOf = (u) => ({ id: u.id, role: u.role });

/**
 * Background job: compare the citizen's photo with the repair photo.
 * @returns {Promise<{ outcome: "done"|"skipped"|"retry"|"gave_up", verdict?, reason? }>}
 *   On "gave_up" the admin simply decides without the AI.
 */
export async function runRepairValidation(prisma, { submissionId }, { validateRepair, storage, now = new Date() }) {
  const s = await prisma.repairSubmission.findUnique({
    where: { id: submissionId },
    include: { photos: true, issue: { include: { category: true } } },
  });
  if (!s) return { outcome: "skipped", reason: "submission not found" };
  if (s.aiVerdict) return { outcome: "skipped", reason: "already checked" };
  if (s.status !== "SUBMITTED") return { outcome: "skipped", reason: "already reviewed" };

  const after = s.photos.find((p) => p.kind === "REPAIR_EVIDENCE");
  // The citizen's photo as it was when the work was assigned (the current one).
  const before = await prisma.photo.findFirst({
    where: { issueId: s.issueId, kind: "ISSUE_ORIGINAL", replacedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!after || !before) return { outcome: "skipped", reason: "photo missing" };

  let result;
  try {
    const [beforeImage, afterImage] = await Promise.all([storage.get(before.publicKey), storage.get(after.publicKey)]);
    result = await validateRepair({ before: beforeImage, after: afterImage, categoryKey: s.issue.category.key });
  } catch (err) {
    const { aiAttempts } = await prisma.repairSubmission.update({
      where: { id: s.id },
      data: { aiAttempts: { increment: 1 } },
      select: { aiAttempts: true },
    });
    console.warn(`Repair check failed for submission ${s.id} (attempt ${aiAttempts}): ${err.message}`);
    return { outcome: aiAttempts < MAX_REPAIR_CHECK_ATTEMPTS ? "retry" : "gave_up", reason: err.message };
  }

  await prisma.repairSubmission.update({
    where: { id: s.id },
    data: {
      aiVerdict: result.verdict,
      aiVerdictReason: result.reason,
      aiModel: result.model ?? null,
      aiAttempts: { increment: 1 },
      aiCheckedAt: now,
    },
  });
  return { outcome: "done", verdict: result.verdict };
}

async function loadForReview(db, user, submissionId) {
  const s = await db.repairSubmission.findUnique({ where: { id: submissionId }, include: { issue: true, assignment: true } });
  if (!s) throw new AppError(404, "NOT_FOUND", "Not found");
  assertInDepartment(user, s.issue);
  if (s.status !== "SUBMITTED") throw new AppError(409, "ALREADY_REVIEWED", "This submission was already reviewed");
  return s;
}

async function markReviewed(tx, s, user, status, reason, now) {
  const { count } = await tx.repairSubmission.updateMany({
    where: { id: s.id, status: "SUBMITTED" },
    data: { status, reviewedById: user.id, reviewedAt: now, reviewReason: reason ?? null },
  });
  if (count !== 1) throw new AppError(409, "ALREADY_REVIEWED", "This submission was already reviewed");
}

/**
 * Approve → submission APPROVED, issue RESOLVED, assignment completed. The repair photo's public
 * copy (no EXIF/GPS) becomes visible to the citizen. Reporter, supporters and the contractor are told.
 * The admin decides; the AI verdict (even INVALID) never blocks this.
 */
export async function approveSubmission(prisma, { user, submissionId, note, now = new Date() }) {
  const s = await loadForReview(prisma, user, submissionId);
  if (s.issue.status !== "IN_PROGRESS") throw new AppError(409, "ISSUE_NOT_IN_PROGRESS", "The issue is not in progress");

  await prisma.$transaction(async (tx) => {
    await markReviewed(tx, s, user, "APPROVED", note, now);
    const moved = await tx.issue.updateMany({
      where: { id: s.issueId, status: "IN_PROGRESS", departmentId: s.issue.departmentId },
      data: { status: "RESOLVED", resolvedAt: now },
    });
    if (moved.count !== 1) throw new AppError(409, "ALREADY_HANDLED", "Someone else already changed this issue");
    await tx.assignment.update({
      where: { id: s.assignmentId },
      data: { ...resumeData(s.assignment, now), endedAt: now, endReason: "Repair approved" },
    });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.SUBMISSION_APPROVED,
      targetType: AuditTarget.ISSUE,
      targetId: s.issueId,
      reason: note ?? undefined,
      metadata: { submissionId: s.id, aiVerdict: s.aiVerdict ?? null },
    });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.ISSUE_STATUS_CHANGED,
      targetType: AuditTarget.ISSUE,
      targetId: s.issueId,
      reason: "Repair evidence approved",
      metadata: { from: "IN_PROGRESS", to: "RESOLVED", submissionId: s.id },
    });
    await clearEscalation(tx, s.issueId, { actor: actorOf(user), reason: "Resolved", now });
    await notifyIssueFollowers(tx, { issueId: s.issueId, type: "RESOLVED", params: {} });
    await tx.notification.create({
      data: { userId: s.contractorId, type: "RESOLVED", issueId: s.issueId, params: { audience: "CONTRACTOR", submissionId: s.id } },
    });
  });
  return { issueId: s.issueId };
}

/**
 * Reject → rework. Reason required and sent to the contractor, who can submit again.
 * The issue stays IN_PROGRESS and the deadline clock resumes.
 */
export async function rejectSubmission(prisma, { user, submissionId, reason, now = new Date() }) {
  const s = await loadForReview(prisma, user, submissionId);

  await prisma.$transaction(async (tx) => {
    await markReviewed(tx, s, user, "REJECTED", reason, now);
    await tx.assignment.update({ where: { id: s.assignmentId }, data: resumeData(s.assignment, now) });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.SUBMISSION_REJECTED,
      targetType: AuditTarget.ISSUE,
      targetId: s.issueId,
      reason,
      metadata: { submissionId: s.id, aiVerdict: s.aiVerdict ?? null },
    });
    await tx.notification.create({
      data: { userId: s.contractorId, type: "REWORK_REQUESTED", issueId: s.issueId, params: { submissionId: s.id, reason } },
    });
  });
  return { issueId: s.issueId };
}
