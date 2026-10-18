// Helpers for Phase 4 (assignment, contractor work, repair review).
import crypto from "node:crypto";
import { makeUser, loginAgent } from "./auth.js";
import { cameraJpeg } from "./images.js";
import { newReport, setAi } from "./admin.js";

const DAY = 24 * 60 * 60 * 1000;
export const inDays = (n, from = new Date()) => new Date(from.getTime() + n * DAY);

/** An active contractor who accepted the invite (has a password), logged in. */
export async function contractorSetup(prisma, app, overrides = {}) {
  const contractor = await makeUser(prisma, { role: "CONTRACTOR", workType: "roads", phone: "+91 98220 00000", ...overrides });
  return { contractor, agent: await loginAgent(app, contractor.email) };
}

/** A roads report, accepted with a priority by the roads admin. Returns the issue id. */
export async function acceptedIssue(prisma, { citizenAgent, admin, priority = "MEDIUM", fields } = {}) {
  const issue = await newReport(citizenAgent, fields);
  await setAi(prisma, issue.id, { riskLevel: priority });
  const res = await admin.agent.post(`/api/admin/issues/${issue.id}/accept`).send({ priority });
  if (res.status !== 200) throw new Error(`accept failed: ${res.status} ${JSON.stringify(res.body)}`);
  return issue.id;
}

export const assign = (admin, issueId, contractorId, deadlineAt = inDays(7)) =>
  admin.agent.post(`/api/admin/issues/${issueId}/assign`).send({ contractorId, deadlineAt: deadlineAt.toISOString() });

/** Multipart repair evidence upload. `photo: null` sends none. */
export async function submitRepair(agent, issueId, { photo, ...fields } = {}) {
  const body = { clientRequestId: crypto.randomUUID(), note: "Patched and levelled", ...fields };
  let req = agent.post(`/api/contractor/issues/${issueId}/submissions`);
  for (const [k, v] of Object.entries(body)) if (v !== undefined) req = req.field(k, String(v));
  if (photo !== null) req = req.attach("photo", photo ?? (await cameraJpeg()), { filename: "repair.jpg", contentType: "image/jpeg" });
  return req;
}

/** A repair validator that always answers the same (tests never call the real Gemini). */
export const fakeRepairValidator = (answer = {}) => {
  const calls = [];
  const fn = async (input) => {
    calls.push(input);
    return { verdict: "VALID", reason: "Same spot, surface repaired", model: "fake-model", ...answer };
  };
  fn.calls = calls;
  return fn;
};

export { setAi };
