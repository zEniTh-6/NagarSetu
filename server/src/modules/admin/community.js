// Community signal (brief, workflow step 7): upvotes and supporters, kept separate from the AI risk.
// Upvotes ≠ physical severity, so the admin also sees how many DISTINCT accounts back the issue
// and how many of them are new. "Low supporter diversity" is information only (D-018).
import { Prisma } from "../../generated/prisma/client.ts";
import { env } from "../../config/env.js";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function diversityRule(config = env) {
  return {
    minAccounts: config.LOW_DIVERSITY_MIN_ACCOUNTS,
    newShare: config.LOW_DIVERSITY_NEW_SHARE,
    newAccountDays: config.NEW_ACCOUNT_DAYS,
  };
}

export const isLowDiversity = ({ accounts, newAccounts }, rule = diversityRule()) =>
  accounts >= rule.minAccounts && newAccounts / accounts >= rule.newShare;

/**
 * @returns {Promise<Record<string, { upvotes, supporters, accounts, newAccounts, lowDiversity }>>}
 *   one entry per issue id. The reporter never counts as their own backer.
 */
export async function communitySignals(db, issueIds, { now = new Date(), rule = diversityRule() } = {}) {
  if (!issueIds.length) return {};
  const ids = Prisma.join(issueIds.map((id) => Prisma.sql`${id}::uuid`));
  const cutoff = new Date(now.getTime() - rule.newAccountDays * DAY_MS);

  const [upvotes, supporters, backers] = await Promise.all([
    db.upvote.groupBy({ by: ["issueId"], where: { issueId: { in: issueIds } }, _count: { _all: true } }),
    db.issueSupporter.groupBy({ by: ["issueId"], where: { issueId: { in: issueIds } }, _count: { _all: true } }),
    db.$queryRaw`
      WITH backers AS (
        SELECT issue_id, user_id FROM upvotes WHERE issue_id IN (${ids})
        UNION
        SELECT issue_id, user_id FROM issue_supporters WHERE issue_id IN (${ids})
      )
      SELECT b.issue_id::text AS "issueId",
             count(*)::int AS accounts,
             (count(*) FILTER (WHERE u.created_at > ${cutoff}))::int AS "newAccounts"
      FROM backers b
      JOIN users u ON u.id = b.user_id
      JOIN issues i ON i.id = b.issue_id AND i.reporter_id <> b.user_id
      GROUP BY b.issue_id`,
  ]);

  const count = (rows) => Object.fromEntries(rows.map((r) => [r.issueId, r._count._all]));
  const up = count(upvotes);
  const sup = count(supporters);
  const back = Object.fromEntries(backers.map((r) => [r.issueId, r]));
  return Object.fromEntries(
    issueIds.map((id) => {
      const accounts = back[id]?.accounts ?? 0;
      const newAccounts = back[id]?.newAccounts ?? 0;
      return [id, { upvotes: up[id] ?? 0, supporters: sup[id] ?? 0, accounts, newAccounts, lowDiversity: isLowDiversity({ accounts, newAccounts }, rule) }];
    }),
  );
}
