// Duplicate handling (brief, workflow step 4). Never auto-merges; duplicate ≠ fake.
//   1. Before submitting, the web app asks checkForDuplicates(); the citizen sees similar active reports.
//   2. Accept → supportIssue(): no new issue, the citizen is added as a supporter.
//   3. Deny → the report is created with duplicateCandidateIds → POSSIBLE_DUPLICATE flag for the admin.
//   4. The background embedding job also re-checks every new report (the web app may skip step 1).
import { AppError } from "../../lib/AppError.js";
import { env } from "../../config/env.js";
import { getCategoryRules } from "../../rules/categories.js";
import { findDuplicateCandidates, setIssueEmbedding, ACTIVE_STATUSES } from "../../geo/duplicates.js";
import { issueLocations } from "../../geo/issues.js";
import { addFlag } from "./flags.js";

export const MAX_EMBEDDING_ATTEMPTS = 6;

const candidateView = (c, category, supporters) => ({
  id: c.id,
  category: { key: category.key, name: category.name },
  description: c.description,
  status: c.status,
  reportedAt: c.createdAt,
  distanceM: Math.round(c.distanceM),
  similarity: Math.round(c.similarity * 100) / 100,
  supporters,
});

async function supporterCounts(prisma, ids) {
  if (!ids.length) return {};
  const rows = await prisma.issueSupporter.groupBy({ by: ["issueId"], where: { issueId: { in: ids } }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.issueId, r._count._all]));
}

/**
 * Called by the report form before submitting. If the embedding service is down the answer is
 * { checked: false } and the citizen simply continues: a failure never blocks a report.
 */
export async function checkForDuplicates(prisma, { input, embed, threshold = env.DUPLICATE_SIMILARITY_THRESHOLD }) {
  const category = await prisma.category.findUnique({ where: { key: input.categoryKey } });
  if (!category || !category.active) throw new AppError(400, "UNKNOWN_CATEGORY", "Unknown category");

  let embedding;
  try {
    embedding = await embed(input.description);
  } catch (err) {
    console.warn("Duplicate check skipped (embedding unavailable):", err.message);
    return { checked: false, candidates: [] };
  }

  const found = await findDuplicateCandidates(prisma, {
    categoryId: category.id,
    lat: input.lat,
    lng: input.lng,
    radiusM: getCategoryRules(category.key).duplicateRadiusM,
    embedding,
    threshold,
  });
  const counts = await supporterCounts(prisma, found.map((c) => c.id));
  return { checked: true, candidates: found.map((c) => candidateView(c, category, counts[c.id] ?? 0)) };
}

/** "Yes, this is my problem too": adds the citizen as a supporter. Safe to repeat. */
export async function supportIssue(prisma, { user, issueId, source }) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new AppError(404, "NOT_FOUND", "Not found");
  if (!ACTIVE_STATUSES.includes(issue.status)) throw new AppError(409, "ISSUE_NOT_ACTIVE", "This issue is closed");
  if (issue.reporterId === user.id) throw new AppError(409, "OWN_ISSUE", "You reported this issue yourself");

  const existing = await prisma.issueSupporter.findUnique({ where: { issueId_userId: { issueId, userId: user.id } } });
  if (!existing) {
    try {
      await prisma.issueSupporter.create({ data: { issueId, userId: user.id, source } });
    } catch (err) {
      if (err?.code !== "P2002") throw err; // two clicks at once: already supporting
    }
  }
  const supporters = await prisma.issueSupporter.count({ where: { issueId } });
  return { issueId, supporting: true, alreadySupporting: Boolean(existing), supporters };
}

/**
 * Which of the ids the citizen was shown are real, active issues of the same category?
 * (Anything else is ignored rather than trusted.)
 */
export async function validCandidateIds(db, { ids, categoryId }) {
  if (!ids?.length) return [];
  const rows = await db.issue.findMany({
    where: { id: { in: ids }, categoryId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export const duplicateReason = (ids, how) =>
  `Possible duplicate of ${ids.join(", ")} (${how === "declined" ? "citizen saw it and filed a new report" : "found automatically"})`;

/**
 * Background job: embed the description, store it, then look for similar nearby reports and
 * flag POSSIBLE_DUPLICATE (once). Returns "retry" when the embedding service failed.
 */
export async function runIssueEmbedding(prisma, { issueId }, { embed, threshold = env.DUPLICATE_SIMILARITY_THRESHOLD, model, now = new Date() }) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId }, include: { category: true } });
  if (!issue) return { outcome: "skipped", reason: "issue not found" };
  if (issue.embeddedAt) return { outcome: "skipped", reason: "already embedded" };

  let vector;
  try {
    vector = await embed(issue.description);
  } catch (err) {
    const { embeddingAttempts } = await prisma.issue.update({
      where: { id: issueId },
      data: { embeddingAttempts: { increment: 1 } },
      select: { embeddingAttempts: true },
    });
    console.warn(`Embedding failed for issue ${issueId} (attempt ${embeddingAttempts}): ${err.message}`);
    return { outcome: embeddingAttempts < MAX_EMBEDDING_ATTEMPTS ? "retry" : "gave_up", reason: err.message };
  }

  await setIssueEmbedding(prisma, issueId, vector, model ?? env.GEMINI_EMBEDDING_MODEL, now);
  if (!ACTIVE_STATUSES.includes(issue.status)) return { outcome: "done", candidates: [] };

  const location = (await issueLocations(prisma, [issueId]))[issueId];
  const found = await findDuplicateCandidates(prisma, {
    categoryId: issue.categoryId,
    ...location,
    radiusM: getCategoryRules(issue.category.key).duplicateRadiusM,
    embedding: vector,
    threshold,
    excludeIssueId: issueId,
  });
  // Only older reports count: the newer one is the possible duplicate.
  const older = found.filter((c) => c.createdAt <= issue.createdAt).map((c) => c.id);
  if (older.length) {
    await prisma.$transaction(async (tx) => {
      const already = await tx.issueFlag.findFirst({ where: { issueId, type: "POSSIBLE_DUPLICATE", clearedAt: null } });
      if (!already) await addFlag(tx, { issueId, type: "POSSIBLE_DUPLICATE", reason: duplicateReason(older, "auto") });
    });
  }
  return { outcome: "done", candidates: older };
}
