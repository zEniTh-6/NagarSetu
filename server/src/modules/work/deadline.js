// Deadline clock. Deadlines are set only by the admin. The clock pauses while a repair submission
// waits for review, so the contractor isn't charged for the admin's review time.
import { env } from "../../config/env.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default deadline offered per priority, in days (OD-5, D-019). The admin can always change it. */
export function deadlineDays(config = env) {
  return {
    LOW: config.DEADLINE_DAYS_LOW,
    MEDIUM: config.DEADLINE_DAYS_MEDIUM,
    HIGH: config.DEADLINE_DAYS_HIGH,
    CRITICAL: config.DEADLINE_DAYS_CRITICAL,
  };
}

export const suggestedDeadline = (priority, now = new Date(), days = deadlineDays()) =>
  priority ? new Date(now.getTime() + days[priority] * DAY_MS) : null;

/** Total paused time so far, including a pause that is still running. */
export function pausedMs(assignment, now = new Date()) {
  const running = assignment.pausedSince ? Math.max(0, now - assignment.pausedSince) : 0;
  return assignment.pausedSeconds * 1000 + running;
}

/** The deadline that counts: the admin's deadline pushed back by the paused time. */
export const effectiveDeadline = (assignment, now = new Date()) => new Date(assignment.deadlineAt.getTime() + pausedMs(assignment, now));

/** Prisma data to start the pause (when a submission arrives). No-op if already paused. */
export const pauseData = (assignment, now = new Date()) => (assignment.pausedSince ? {} : { pausedSince: now });

/** Prisma data to stop the pause (submission reviewed), adding the paused seconds. */
export function resumeData(assignment, now = new Date()) {
  if (!assignment.pausedSince) return {};
  return {
    pausedSince: null,
    pausedSeconds: assignment.pausedSeconds + Math.round(Math.max(0, now - assignment.pausedSince) / 1000),
  };
}

export function deadlineView(assignment, now = new Date()) {
  return {
    deadlineAt: assignment.deadlineAt,
    effectiveDeadline: effectiveDeadline(assignment, now),
    paused: Boolean(assignment.pausedSince),
    pausedSeconds: Math.round(pausedMs(assignment, now) / 1000),
  };
}
