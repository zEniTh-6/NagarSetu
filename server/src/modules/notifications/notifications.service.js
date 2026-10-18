// In-app notifications (a table the web app polls). A notification stores a type and data
// (`params`), not finished sentences, so the web app can show it in the user's language.
// Text written by an admin (e.g. a rejection reason) is stored as written.
import { AppError } from "../../lib/AppError.js";

/**
 * Notifies everyone following an issue: the reporter and the supporters (D-018).
 * Call it with the same transaction client as the change it reports.
 */
export async function notifyIssueFollowers(tx, { issueId, type, params, excludeUserId }) {
  const issue = await tx.issue.findUnique({
    where: { id: issueId },
    select: { reporterId: true, supporters: { select: { userId: true } } },
  });
  if (!issue) return 0;
  const recipients = [...new Set([issue.reporterId, ...issue.supporters.map((s) => s.userId)])].filter((id) => id !== excludeUserId);
  if (!recipients.length) return 0;
  const { count } = await tx.notification.createMany({
    data: recipients.map((userId) => ({ userId, type, issueId, params: params ?? undefined })),
  });
  return count;
}

const view = (n) => ({ id: n.id, type: n.type, issueId: n.issueId, params: n.params ?? {}, readAt: n.readAt, createdAt: n.createdAt });

/** The signed-in user's notifications, newest first, plus the unread count (for the badge). */
export async function listNotifications(prisma, { user, page, pageSize, unreadOnly }) {
  const where = { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { items: items.map(view), page, pageSize, total, unread };
}

/** Marks one of your own notifications read. Someone else's answers 404. */
export async function markRead(prisma, { user, id, now = new Date() }) {
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n || n.userId !== user.id) throw new AppError(404, "NOT_FOUND", "Not found");
  const updated = n.readAt ? n : await prisma.notification.update({ where: { id }, data: { readAt: now } });
  return view(updated);
}

export async function markAllRead(prisma, { user, now = new Date() }) {
  const { count } = await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: now } });
  return { marked: count };
}

/** Notifies the active admins of a department (escalations, disputes). */
export async function notifyDepartmentAdmins(tx, { departmentId, type, issueId, params }) {
  const admins = await tx.user.findMany({ where: { role: "ADMIN", departmentId, status: "ACTIVE" }, select: { id: true } });
  if (!admins.length) return 0;
  const { count } = await tx.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, type, issueId, params: params ?? undefined })),
  });
  return count;
}
