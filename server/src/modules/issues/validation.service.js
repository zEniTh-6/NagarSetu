// Background photo check for one issue photo. Called by the pg-boss worker (and directly in tests).
// A Gemini failure never blocks the report: it adds "validation pending" and the job is retried.
import { addFlag, clearFlags, FLAG_REASON } from "./flags.js";

/** First try + 5 retries. pg-boss is configured with retryLimit = MAX_ATTEMPTS - 1. */
export const MAX_ATTEMPTS = 6;

/**
 * @returns {Promise<{ outcome: "done"|"skipped"|"retry"|"gave_up", reason?: string, verdict?: string }>}
 *   "retry" means the caller (the job) should throw so pg-boss tries again later.
 */
export async function runPhotoValidation(prisma, { issueId, photoId }, { validatePhoto, storage, now = new Date() }) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId }, include: { category: true } });
  if (!issue) return { outcome: "skipped", reason: "issue not found" };
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.issueId !== issueId || photo.replacedAt) return { outcome: "skipped", reason: "photo replaced" };
  if (issue.aiVerdict && issue.aiCheckedAt && issue.aiCheckedAt >= photo.createdAt) {
    return { outcome: "skipped", reason: "already checked" };
  }

  let result;
  try {
    const image = await storage.get(photo.publicKey);
    result = await validatePhoto({ image, mimeType: "image/jpeg", categoryKey: issue.category.key });
  } catch (err) {
    return recordFailure(prisma, issue, err, now);
  }

  const suggested =
    result.suggestedCategory && result.suggestedCategory !== issue.category.key
      ? await prisma.category.findUnique({ where: { key: result.suggestedCategory } })
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: issue.id },
      data: {
        aiVerdict: result.verdict,
        aiVerdictReason: result.reason,
        aiRiskLevel: result.risk.level,
        aiRiskReason: result.risk.reason,
        aiSuggestedCategoryId: suggested?.id ?? null,
        aiModel: result.model ?? null,
        aiAttempts: { increment: 1 },
        aiCheckedAt: now,
      },
    });
    await clearFlags(tx, {
      issueId: issue.id,
      type: "PENDING_REVIEW",
      reason: FLAG_REASON.VALIDATION_PENDING,
      clearReason: "Photo checked by AI",
      now,
    });
    if (result.verdict === "UNCERTAIN") {
      await addFlag(tx, { issueId: issue.id, type: "PENDING_REVIEW", reason: FLAG_REASON.AI_UNCERTAIN, detail: result.reason });
    }
  });
  return { outcome: "done", verdict: result.verdict };
}

async function recordFailure(prisma, issue, err, now) {
  console.warn(`Photo check failed for issue ${issue.id}: ${err.message}`);
  return prisma.$transaction(async (tx) => {
    const { aiAttempts } = await tx.issue.update({
      where: { id: issue.id },
      data: { aiAttempts: { increment: 1 } },
      select: { aiAttempts: true },
    });
    if (aiAttempts < MAX_ATTEMPTS) {
      await addFlag(tx, { issueId: issue.id, type: "PENDING_REVIEW", reason: FLAG_REASON.VALIDATION_PENDING });
      return { outcome: "retry", reason: err.message };
    }
    await clearFlags(tx, {
      issueId: issue.id,
      type: "PENDING_REVIEW",
      reason: FLAG_REASON.VALIDATION_PENDING,
      clearReason: `Gave up after ${aiAttempts} attempts`,
      now,
    });
    await addFlag(tx, { issueId: issue.id, type: "PENDING_REVIEW", reason: FLAG_REASON.VALIDATION_GAVE_UP });
    return { outcome: "gave_up", reason: err.message };
  });
}
