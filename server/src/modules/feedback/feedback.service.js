// Citizen feedback after resolution, and the admin's dispute decisions (brief, workflow step 12).
//   - Only the reporter and supporters, only while RESOLVED, within FEEDBACK_WINDOW_DAYS.
//   - Feedback is a SIGNAL, not a vote. RESOLVED stays RESOLVED; silence is "no response".
//   - "Not fixed" (reason required, photo optional) adds DISPUTED and tells the department's admins.
//   - Only an admin reopens (RESOLVED → ACKNOWLEDGED) or dismisses a dispute, always with a reason
//     that is shown to the citizens.
import crypto from "node:crypto";
import { AppError } from "../../lib/AppError.js";
import { assertInDepartment } from "../../auth/scope.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { processPhoto } from "../../images/processPhoto.js";
import { env } from "../../config/env.js";
import { addFlag, clearFlags, FLAG_REASON } from "../issues/flags.js";
import { photoUrl } from "../issues/issues.views.js";
import { notifyIssueFollowers, notifyDepartmentAdmins } from "../notifications/notifications.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const notFound = () => new AppError(404, "NOT_FOUND", "Not found");
const actorOf = (u) => ({ id: u.id, role: u.role });

export const windowEndsAt = (resolvedAt, days = env.FEEDBACK_WINDOW_DAYS) => new Date(resolvedAt.getTime() + days * DAY_MS);

/** Reporter or supporter of the issue? */
export async function isFollower(db, user, issue) {
  if (user.role !== "CITIZEN") return false;
  if (issue.reporterId === user.id) return true;
  return Boolean(await db.issueSupporter.findUnique({ where: { issueId_userId: { issueId: issue.id, userId: user.id } } }));
}

/** What the citizen's issue view says about feedback (only for RESOLVED issues). */
export async function citizenFeedbackState(db, user, issue, now = new Date()) {
  if (issue.status !== "RESOLVED" || !issue.resolvedAt) return {};
  const mine = await db.issueFeedback.findUnique({
    where: { issueId_userId_roundResolvedAt: { issueId: issue.id, userId: user.id, roundResolvedAt: issue.resolvedAt } },
  });
  const ends = windowEndsAt(issue.resolvedAt);
  return {
    feedback: {
      canRespond: !mine && now <= ends,
      windowEndsAt: ends,
      myResponse: mine ? { verdict: mine.verdict, reason: mine.reason, at: mine.createdAt } : null,
    },
  };
}

const DISPUTE_DECISIONS = [AuditAction.DISPUTE_DISMISSED, AuditAction.ISSUE_REOPENED];

/**
 * The citizen's own "not fixed" answer and what the department decided about it: kept resolved or
 * reopened, the admin's reason as written, the department's name and the date. Shown while the
 * issue is still in that round (RESOLVED with the same resolution, or reopened and not yet resolved
 * again); after a new resolution the old decision stays in the timeline.
 */
export async function citizenMyFeedback(db, user, issue) {
  const mine = await db.issueFeedback.findFirst({ where: { issueId: issue.id, userId: user.id }, orderBy: { createdAt: "desc" } });
  if (!mine || mine.verdict !== "NOT_FIXED") return {};
  if (issue.resolvedAt && issue.resolvedAt.getTime() !== mine.roundResolvedAt.getTime()) return {};
  // The first decision after the answer is the one that decided it (a round ends only on reopen).
  const row = await db.auditLog.findFirst({
    where: { targetType: AuditTarget.ISSUE, targetId: issue.id, action: { in: DISPUTE_DECISIONS }, createdAt: { gte: mine.createdAt } },
    include: { actor: { select: { department: { select: { name: true } } } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const decision = row
    ? {
        outcome: row.action === AuditAction.DISPUTE_DISMISSED ? "KEPT_RESOLVED" : "REOPENED",
        reason: row.reason ?? null,
        department: row.actor?.department?.name ?? null,
        at: row.createdAt,
      }
    : null;
  return { myFeedback: { verdict: mine.verdict, reason: mine.reason, at: mine.createdAt, decision } };
}

/** "Yes, fixed" / "Not fixed". One answer per person per resolution. */
export async function giveFeedback(prisma, { user, issueId, input, file, storage, now = new Date() }) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue || !(await isFollower(prisma, user, issue))) throw notFound(); // anyone else: as if it didn't exist
  if (issue.status !== "RESOLVED" || !issue.resolvedAt) throw new AppError(409, "NOT_RESOLVED", "Feedback opens once the issue is resolved");
  if (now > windowEndsAt(issue.resolvedAt)) throw new AppError(409, "FEEDBACK_WINDOW_CLOSED", "The time to give feedback on this repair has ended");
  if (file && input.verdict !== "NOT_FIXED") throw new AppError(400, "PHOTO_ONLY_FOR_NOT_FIXED", "A photo can only be added to a 'not fixed' answer");

  const round = { issueId_userId_roundResolvedAt: { issueId, userId: user.id, roundResolvedAt: issue.resolvedAt } };
  if (await prisma.issueFeedback.findUnique({ where: round })) throw new AppError(409, "ALREADY_RESPONDED", "You already answered for this repair");

  const feedbackId = crypto.randomUUID();
  let photo = null;
  if (file) {
    const processed = await processPhoto(file.buffer);
    const photoId = crypto.randomUUID();
    const originalKey = `issues/${issueId}/feedback/${photoId}-original.${processed.ext}`;
    const publicKey = `issues/${issueId}/feedback/${photoId}-public.jpg`;
    await storage.put(originalKey, processed.original, processed.mimeType);
    await storage.put(publicKey, processed.public, "image/jpeg");
    photo = {
      id: photoId,
      kind: "FEEDBACK",
      issueId,
      feedbackId,
      uploadedById: user.id,
      originalKey,
      publicKey,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      sizeBytes: processed.sizeBytes,
      sha256: processed.sha256,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.issueFeedback.create({
        data: { id: feedbackId, issueId, userId: user.id, verdict: input.verdict, reason: input.reason ?? null, roundResolvedAt: issue.resolvedAt },
      });
      if (photo) await tx.photo.create({ data: photo });
      await writeAudit(tx, {
        actor: actorOf(user),
        action: AuditAction.FEEDBACK_RECORDED,
        targetType: AuditTarget.ISSUE,
        targetId: issueId,
        reason: input.reason ?? undefined,
        metadata: { feedbackId, verdict: input.verdict },
      });
      if (input.verdict === "NOT_FIXED") {
        await addFlag(tx, { issueId, type: "DISPUTED", reason: FLAG_REASON.NOT_FIXED, detail: input.reason, actor: actorOf(user) });
        await notifyDepartmentAdmins(tx, { departmentId: issue.departmentId, type: "DISPUTE_RAISED", issueId, params: { feedbackId, reason: input.reason } });
      }
    });
  } catch (err) {
    if (err?.code === "P2002") throw new AppError(409, "ALREADY_RESPONDED", "You already answered for this repair");
    throw err;
  }
  return { verdict: input.verdict, reason: input.reason ?? null, at: now };
}

async function loadResolved(db, user, issueId) {
  const issue = assertInDepartment(user, await db.issue.findUnique({ where: { id: issueId } }));
  if (issue.status !== "RESOLVED") throw new AppError(409, "NOT_RESOLVED", "Only resolved issues can be reopened or have disputes");
  return issue;
}

/**
 * Reopen (admin only): RESOLVED → ACKNOWLEDGED, with a reason shown to the reporter and supporters.
 * The admin then assigns the follow-up work. Earlier rounds, photos and feedback are kept.
 */
export async function reopenIssue(prisma, { user, issueId, reason, now = new Date() }) {
  const issue = await loadResolved(prisma, user, issueId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.issue.updateMany({
      where: { id: issueId, status: "RESOLVED", departmentId: issue.departmentId },
      data: { status: "ACKNOWLEDGED", resolvedAt: null, statusReason: reason },
    });
    if (count !== 1) throw new AppError(409, "ALREADY_HANDLED", "Someone else already changed this issue");
    const disputes = await clearFlags(tx, { issueId, type: "DISPUTED", clearReason: `Reopened: ${reason}`, actor: actorOf(user), now });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.ISSUE_REOPENED,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      reason,
      // disputed: this reopen also decided a "not fixed" answer (shown as "Dispute reviewed — reopened").
      metadata: { from: "RESOLVED", to: "ACKNOWLEDGED", resolvedAt: issue.resolvedAt?.toISOString() ?? null, disputed: disputes > 0 },
    });
    await notifyIssueFollowers(tx, { issueId, type: "REOPENED", params: { reason } });
  });
}

/** Keep it RESOLVED after "not fixed": the reason goes to the citizens who said "not fixed". */
export async function dismissDispute(prisma, { user, issueId, reason, now = new Date() }) {
  const issue = await loadResolved(prisma, user, issueId);
  const disputed = await prisma.issueFlag.count({ where: { issueId, type: "DISPUTED", clearedAt: null } });
  if (!disputed) throw new AppError(409, "NO_DISPUTE", "There is no open dispute on this issue");

  await prisma.$transaction(async (tx) => {
    const cleared = await clearFlags(tx, { issueId, type: "DISPUTED", clearReason: reason, actor: actorOf(user), now });
    if (!cleared) throw new AppError(409, "ALREADY_HANDLED", "Someone else already handled this dispute");
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.DISPUTE_DISMISSED,
      targetType: AuditTarget.ISSUE,
      targetId: issueId,
      reason,
      metadata: { resolvedAt: issue.resolvedAt?.toISOString() ?? null },
    });
    const notFixed = await tx.issueFeedback.findMany({
      where: { issueId, roundResolvedAt: issue.resolvedAt, verdict: "NOT_FIXED" },
      select: { userId: true },
    });
    if (notFixed.length) {
      await tx.notification.createMany({
        data: notFixed.map((f) => ({ userId: f.userId, type: "DISPUTE_DISMISSED", issueId, params: { reason } })),
      });
    }
  });
}

/** Admin review screen: every answer, plus a summary for the current resolution. */
export async function adminFeedbackView(db, issue, now = new Date()) {
  const rows = await db.issueFeedback.findMany({
    where: { issueId: issue.id },
    include: { user: { select: { id: true, name: true } }, photos: true },
    orderBy: { createdAt: "asc" },
  });
  const responses = rows.map((f) => ({
    id: f.id,
    by: { id: f.user.id, name: f.user.name },
    verdict: f.verdict,
    reason: f.reason,
    photo: f.photos[0] ? { id: f.photos[0].id, url: photoUrl(f.photos[0].id) } : null,
    roundResolvedAt: f.roundResolvedAt,
    at: f.createdAt,
  }));
  if (issue.status !== "RESOLVED" || !issue.resolvedAt) return { feedback: { current: null, responses } };

  const current = rows.filter((f) => f.roundResolvedAt.getTime() === issue.resolvedAt.getTime());
  const followers = 1 + (await db.issueSupporter.count({ where: { issueId: issue.id } }));
  const fixed = current.filter((f) => f.verdict === "FIXED").length;
  const notFixed = current.length - fixed;
  return {
    feedback: {
      current: {
        resolvedAt: issue.resolvedAt,
        windowEndsAt: windowEndsAt(issue.resolvedAt),
        open: now <= windowEndsAt(issue.resolvedAt),
        fixed,
        notFixed,
        noResponse: Math.max(0, followers - current.length), // silence is "no response", never "confirmed"
      },
      responses,
    },
  };
}
