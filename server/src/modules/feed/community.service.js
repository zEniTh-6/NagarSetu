// Upvotes, comments, comment reports, hiding comments and official replies (brief: "Feed,
// comments, upvotes"; D-025).
//   - Upvotes are a signal only: one per verified account, never on your own report, never trigger
//     anything (no notification, no priority change).
//   - Comments live on public issues. Hidden comments disappear for every citizen.
//   - A report is a signal for the department admin, who decides whether to hide (reason + audit).
//   - Official replies come from the admin of the issue's department, are signed with the
//     department's name, notify the reporter and supporters, and are audited. They can't be hidden.
import { AppError } from "../../lib/AppError.js";
import { assertInDepartment } from "../../auth/scope.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { ACTIVE_STATUSES } from "../../geo/duplicates.js";
import { isFollower } from "../feedback/feedback.service.js";
import { notifyIssueFollowers } from "../notifications/notifications.service.js";
import { isPublic } from "./visibility.js";
import { citizenCommentView, adminCommentView } from "./feed.views.js";

const notFound = () => new AppError(404, "NOT_FOUND", "Not found");
const actorOf = (u) => ({ id: u.id, role: u.role });
const COMMENT_AUTHOR = { select: { name: true, department: { select: { name: true } } } };
const EXCERPT = 140;

/**
 * The issue, if this citizen may see it: public, or they report/support it. Otherwise 404 (same as
 * a missing issue). Returns { issue, visible: "PUBLIC"|"FOLLOWER" }.
 */
async function issueForCitizen(prisma, user, issueId) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw notFound();
  if (isPublic(issue)) return issue;
  if (await isFollower(prisma, user, issue)) return issue;
  throw notFound();
}

const notPublic = () => new AppError(409, "ISSUE_NOT_PUBLIC", "This report is not public yet");

async function upvoteCount(db, issueId) {
  return db.upvote.count({ where: { issueId } });
}

export async function upvote(prisma, { user, issueId }) {
  const issue = await issueForCitizen(prisma, user, issueId);
  if (!isPublic(issue)) throw notPublic();
  if (issue.reporterId === user.id) throw new AppError(409, "OWN_ISSUE", "You reported this issue yourself");
  if (!ACTIVE_STATUSES.includes(issue.status)) throw new AppError(409, "ISSUE_NOT_ACTIVE", "This issue is closed");
  let already = false;
  try {
    await prisma.upvote.create({ data: { issueId, userId: user.id } });
  } catch (err) {
    if (err?.code !== "P2002") throw err; // one per account: a second press is a no-op
    already = true;
  }
  return { issueId, upvoted: true, alreadyUpvoted: already, upvotes: await upvoteCount(prisma, issueId) };
}

/** Removing an upvote always works (also after the issue closed), and is a no-op when there is none. */
export async function removeUpvote(prisma, { user, issueId }) {
  await issueForCitizen(prisma, user, issueId);
  await prisma.upvote.deleteMany({ where: { issueId, userId: user.id } });
  return { issueId, upvoted: false, upvotes: await upvoteCount(prisma, issueId) };
}

/** Comments citizens can see (not hidden), newest first. */
export async function listComments(prisma, { user, issueId, page, pageSize }) {
  await issueForCitizen(prisma, user, issueId);
  const where = { issueId, hiddenAt: null };
  const [total, rows] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      include: { author: COMMENT_AUTHOR },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const mine = await prisma.commentReport.findMany({
    where: { reporterId: user.id, commentId: { in: rows.map((r) => r.id) } },
    select: { commentId: true },
  });
  const reportedIds = new Set(mine.map((r) => r.commentId));
  return { items: rows.map((c) => citizenCommentView(c, { userId: user.id, reportedIds })), page, pageSize, total };
}

export async function addComment(prisma, { user, issueId, body }) {
  const issue = await issueForCitizen(prisma, user, issueId);
  if (!isPublic(issue)) throw notPublic();
  const comment = await prisma.comment.create({ data: { issueId, authorId: user.id, body }, include: { author: COMMENT_AUTHOR } });
  return citizenCommentView(comment, { userId: user.id });
}

/** A citizen reports someone else's visible comment. One report per person per comment. */
export async function reportComment(prisma, { user, commentId, reason, note }) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.hiddenAt) throw notFound();
  await issueForCitizen(prisma, user, comment.issueId);
  if (comment.isOfficial) throw new AppError(409, "OFFICIAL_REPLY", "Official replies can't be reported");
  if (comment.authorId === user.id) throw new AppError(409, "OWN_COMMENT", "This is your own comment");
  let already = false;
  try {
    await prisma.commentReport.create({ data: { commentId, reporterId: user.id, reason, note: note ?? null } });
  } catch (err) {
    if (err?.code !== "P2002") throw err;
    already = true;
  }
  return { commentId, reported: true, alreadyReported: already };
}

export const ADMIN_COMMENT_INCLUDE = {
  author: { select: { name: true, role: true, status: true, department: { select: { name: true } } } },
  hiddenBy: { select: { id: true, name: true } },
  reports: { orderBy: { createdAt: "asc" } },
};

/** The department admin's list: every comment of the issue, hidden ones and report counts included. */
export async function adminListComments(prisma, { user, issueId, page, pageSize }) {
  assertInDepartment(user, await prisma.issue.findUnique({ where: { id: issueId } }));
  const where = { issueId };
  const [total, rows] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({ where, include: ADMIN_COMMENT_INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: rows.map(adminCommentView), page, pageSize, total };
}

/** Hide a citizen comment (department admin, reason required, audited). */
export async function hideComment(prisma, { user, commentId, reason, now = new Date() }) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { issue: true } });
  if (!comment) throw notFound();
  assertInDepartment(user, comment.issue);
  if (comment.isOfficial) throw new AppError(409, "CANNOT_HIDE_OFFICIAL", "Official replies can't be hidden");
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.comment.updateMany({
      where: { id: commentId, hiddenAt: null },
      data: { hiddenAt: now, hiddenById: user.id, hiddenReason: reason },
    });
    if (count !== 1) throw new AppError(409, "ALREADY_HIDDEN", "This comment is already hidden");
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.COMMENT_HIDDEN,
      targetType: AuditTarget.COMMENT,
      targetId: commentId,
      reason,
      metadata: { issueId: comment.issueId, authorId: comment.authorId },
    });
  });
  return adminCommentView(await prisma.comment.findUnique({ where: { id: commentId }, include: ADMIN_COMMENT_INCLUDE }));
}

/** Official reply from the admin of the issue's department: notifies the followers, audited. */
export async function postOfficialReply(prisma, { user, issueId, body }) {
  const issue = assertInDepartment(user, await prisma.issue.findUnique({ where: { id: issueId } }));
  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.create({ data: { issueId: issue.id, authorId: user.id, body, isOfficial: true }, include: ADMIN_COMMENT_INCLUDE });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: AuditAction.OFFICIAL_REPLY_POSTED,
      targetType: AuditTarget.ISSUE,
      targetId: issue.id,
      metadata: { commentId: c.id },
    });
    await notifyIssueFollowers(tx, {
      issueId: issue.id,
      type: "OFFICIAL_REPLY",
      // As written by the admin; the web app adds the words around it in the user's language.
      params: { commentId: c.id, department: c.author.department?.name ?? null, excerpt: body.length > EXCERPT ? `${body.slice(0, EXCERPT - 1)}…` : body },
    });
    return c;
  });
  return adminCommentView(comment);
}
