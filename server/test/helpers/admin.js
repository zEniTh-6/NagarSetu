// Helpers for admin review tests.
import { makeUser, loginAgent } from "./auth.js";
import { report } from "./issues.js";

/** A second verified citizen (e.g. a supporter), logged in. */
export async function anotherCitizen(prisma, app) {
  const user = await makeUser(prisma, { role: "CITIZEN", emailVerified: true });
  return { user, agent: await loginAgent(app, user.email) };
}

/** Files a report through the API and returns the issue (citizen view). */
export async function newReport(agent, fields) {
  const res = await report(agent, fields);
  if (res.status !== 201) throw new Error(`report failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.issue;
}

/** Sets what the AI said, as if the photo check had run. */
export const setAi = (prisma, issueId, { riskLevel = "MEDIUM", verdict = "VALID" } = {}) =>
  prisma.issue.update({
    where: { id: issueId },
    data: { aiVerdict: verdict, aiVerdictReason: "ok", aiRiskLevel: riskLevel, aiRiskReason: "busy road", aiCheckedAt: new Date() },
  });

export const notificationsOf = (prisma, userId) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
