// Background job: look up the public area name (neighbourhood) of an issue once, from its
// APPROXIMATE point (D-025). A failure never affects the report; after MAX_AREA_ATTEMPTS the issue
// simply keeps no name and the web app shows "Approximate location". Retries are spaced by pg-boss
// (1 min, then doubling), never in a tight loop.
import { approximateLocations } from "../../geo/public.js";

export const MAX_AREA_ATTEMPTS = 3;
const ACTIVE_OR_PUBLIC = ["REPORTED", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"];

/** @returns {Promise<{ outcome: "done"|"skipped"|"retry"|"gave_up", areaName?: string|null, reason?: string }>} */
export async function runAreaLookup(prisma, { issueId }, { lookupArea, now = new Date() }) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { id: true, status: true, areaLookedUpAt: true, areaLookupAttempts: true },
  });
  if (!issue) return { outcome: "skipped", reason: "issue not found" };
  if (issue.areaLookedUpAt) return { outcome: "skipped", reason: "already looked up" };
  if (!ACTIVE_OR_PUBLIC.includes(issue.status)) return { outcome: "skipped", reason: "closed issue" };
  if (issue.areaLookupAttempts >= MAX_AREA_ATTEMPTS) return { outcome: "skipped", reason: "attempts used up" };

  const point = (await approximateLocations(prisma, [issueId]))[issueId];
  let name;
  try {
    name = await lookupArea(point);
  } catch (err) {
    const attempts = issue.areaLookupAttempts + 1;
    const gaveUp = attempts >= MAX_AREA_ATTEMPTS;
    await prisma.issue.update({
      where: { id: issueId },
      data: { areaLookupAttempts: attempts, ...(gaveUp ? { areaLookedUpAt: now } : {}) },
    });
    console.warn(`Area lookup failed for issue ${issueId} (attempt ${attempts}): ${err.message}`);
    return { outcome: gaveUp ? "gave_up" : "retry", reason: err.message };
  }
  await prisma.issue.update({
    where: { id: issueId },
    data: { areaName: name ?? null, areaLookedUpAt: now, areaLookupAttempts: { increment: 1 } },
  });
  return { outcome: "done", areaName: name ?? null };
}

/** Queue a lookup; never fails the caller (the start-up sweep catches anything missed). */
export async function queueAreaLookup(jobs, issueId) {
  try {
    await jobs.enqueueAreaLookup?.({ issueId });
  } catch (err) {
    console.error("Could not queue the area lookup:", err);
  }
}
