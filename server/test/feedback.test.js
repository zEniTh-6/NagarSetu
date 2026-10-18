import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { makeUser, loginAgent } from "./helpers/auth.js";
import { citizenSetup, adminOf } from "./helpers/issues.js";
import { anotherCitizen, notificationsOf } from "./helpers/admin.js";
import { contractorSetup, acceptedIssue, assign, inDays, submitRepair } from "./helpers/work.js";
import { cameraJpeg } from "./helpers/images.js";

const DAY = 24 * 60 * 60 * 1000;
let app, citizen, agent, roads, worker, fan, issueId;

/** Accept → assign → start → submit → approve. */
async function resolve() {
  await worker.agent.post(`/api/contractor/issues/${issueId}/start`).send({});
  await submitRepair(worker.agent, issueId);
  const s = await prisma.repairSubmission.findFirst({ where: { issueId, status: "SUBMITTED" } });
  const res = await roads.agent.post(`/api/admin/submissions/${s.id}/approve`).send({});
  if (res.body.issue?.status !== "RESOLVED") throw new Error(`approve failed: ${JSON.stringify(res.body)}`);
}

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp({ jobs: createMemoryQueue(), storage: tempStorage() });
  ({ citizen, agent } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
  worker = await contractorSetup(prisma, app);
  issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
  fan = await anotherCitizen(prisma, app);
  await fan.agent.post(`/api/issues/${issueId}/support`).send({});
  await assign(roads, issueId, worker.contractor.id, inDays(7));
});
afterAll(() => prisma.$disconnect());

const feedback = (a, fields = {}, photo) => {
  let req = a.post(`/api/issues/${issueId}/feedback`);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return photo ? req.attach("photo", photo, { filename: "still-broken.jpg", contentType: "image/jpeg" }) : req;
};
const issueRow = () => prisma.issue.findUnique({ where: { id: issueId } });
const disputed = () => prisma.issueFlag.findFirst({ where: { issueId, type: "DISPUTED", clearedAt: null } });
const audits = (action) => prisma.auditLog.findMany({ where: { targetId: issueId, action }, orderBy: { id: "asc" } });

describe("citizen feedback after resolution (a signal, not a vote)", () => {
  it("'Yes, fixed' is recorded; the citizen sees their answer; nothing changes", async () => {
    await resolve();
    const before = (await agent.get(`/api/issues/${issueId}`)).body.issue.feedback;
    expect(before).toMatchObject({ canRespond: true, myResponse: null });
    expect(new Date(before.windowEndsAt) - new Date((await issueRow()).resolvedAt)).toBe(14 * DAY);

    const res = await feedback(agent, { verdict: "FIXED" });
    expect(res.status).toBe(201);
    expect((await agent.get(`/api/issues/${issueId}`)).body.issue.feedback).toMatchObject({ canRespond: false, myResponse: { verdict: "FIXED" } });
    expect((await issueRow()).status).toBe("RESOLVED");
    expect(await disputed()).toBeNull();
    expect((await audits("FEEDBACK_RECORDED"))[0]).toMatchObject({ actorId: citizen.id });
  });

  it("citizen says 'Not fixed' → DISPUTED, admins told, status unchanged until the admin acts", async () => {
    await resolve();
    expect((await feedback(fan.agent, { verdict: "NOT_FIXED" })).status).toBe(400); // reason required
    const res = await feedback(fan.agent, { verdict: "NOT_FIXED", reason: "Hole is back after one rain" }, await cameraJpeg());
    expect(res.status).toBe(201);

    expect((await issueRow()).status).toBe("RESOLVED"); // never reopens automatically
    expect((await disputed()).reason).toBe("Citizen says it is not fixed");
    const n = (await notificationsOf(prisma, roads.admin.id)).find((x) => x.type === "DISPUTE_RAISED");
    expect(n.params).toMatchObject({ reason: "Hole is back after one rain" });

    const view = (await roads.agent.get(`/api/issues/${issueId}`)).body.issue;
    expect(view.feedback.current).toMatchObject({ fixed: 0, notFixed: 1, noResponse: 1, open: true });
    expect(view.feedback.responses[0]).toMatchObject({ by: { id: fan.user.id }, verdict: "NOT_FIXED", reason: "Hole is back after one rain" });
    // The photo: admin and its author can see it; the reporter can't.
    const url = view.feedback.responses[0].photo.url;
    expect((await roads.agent.get(url)).status).toBe(200);
    expect((await fan.agent.get(url)).status).toBe(200);
    expect((await agent.get(url)).status).toBe(404);
    expect((await roads.agent.get("/api/admin/dashboard")).body.disputed).toBe(1);
  });

  it("citizen never responds → stays RESOLVED, no confirmation recorded", async () => {
    await resolve();
    const view = (await roads.agent.get(`/api/issues/${issueId}`)).body.issue;
    expect(view.status).toBe("RESOLVED");
    expect(view.feedback.current).toMatchObject({ fixed: 0, notFixed: 0, noResponse: 2 });
    expect(await prisma.issueFeedback.count()).toBe(0);
  });

  it("non-reporter tries to give feedback → blocked (also contractors and admins)", async () => {
    await resolve();
    const stranger = await anotherCitizen(prisma, app);
    expect((await feedback(stranger.agent, { verdict: "NOT_FIXED", reason: "Looks bad" })).status).toBe(404);
    expect((await feedback(worker.agent, { verdict: "FIXED" })).status).toBe(403);
    expect((await feedback(roads.agent, { verdict: "FIXED" })).status).toBe(403);
    expect((await request(app).post(`/api/issues/${issueId}/feedback`).field("verdict", "FIXED")).status).toBe(401);
    const unverified = await makeUser(prisma, { role: "CITIZEN", emailVerified: false });
    expect((await feedback(await loginAgent(app, unverified.email), { verdict: "FIXED" })).status).toBe(403);
    expect(await prisma.issueFeedback.count()).toBe(0);
  });

  it("only once per resolution, only while RESOLVED, only inside the 14-day window", async () => {
    expect((await feedback(agent, { verdict: "FIXED" })).body.error.code).toBe("NOT_RESOLVED");
    await resolve();
    expect((await feedback(agent, { verdict: "FIXED" })).status).toBe(201);
    expect((await feedback(agent, { verdict: "NOT_FIXED", reason: "Changed my mind" })).body.error.code).toBe("ALREADY_RESPONDED");
    expect((await feedback(fan.agent, { verdict: "FIXED" }, await cameraJpeg())).body.error.code).toBe("PHOTO_ONLY_FOR_NOT_FIXED");

    // 15 days later the window has closed.
    await prisma.issue.update({ where: { id: issueId }, data: { resolvedAt: new Date(Date.now() - 15 * DAY) } });
    expect((await feedback(fan.agent, { verdict: "NOT_FIXED", reason: "Still broken" })).body.error.code).toBe("FEEDBACK_WINDOW_CLOSED");
    expect((await fan.agent.get(`/api/issues/${issueId}`)).body.issue.feedback.canRespond).toBe(false);
  });

  it("supporters see the outcome (before/after photos) like the reporter", async () => {
    await resolve();
    const view = (await fan.agent.get(`/api/issues/${issueId}`)).body.issue;
    expect(view.status).toBe("RESOLVED");
    expect((await fan.agent.get(view.resolution.photo.url)).status).toBe(200);
    expect((await fan.agent.get(view.photo.url)).status).toBe(200);
    expect(view.flags).toBeUndefined();
  });
});

describe("admin decides on disputes (reason logged and shown to the citizen)", () => {
  it("dismiss: stays RESOLVED, DISPUTED cleared, the 'not fixed' citizens get the reason", async () => {
    await resolve();
    await feedback(agent, { verdict: "FIXED" });
    await feedback(fan.agent, { verdict: "NOT_FIXED", reason: "Puddle still there" });
    expect((await roads.agent.post(`/api/admin/issues/${issueId}/dispute/dismiss`).send({})).status).toBe(400);

    const res = await roads.agent.post(`/api/admin/issues/${issueId}/dispute/dismiss`).send({ reason: "Inspected: surface is level, puddle is from a blocked drain" });
    expect(res.status).toBe(200);
    expect(res.body.issue.status).toBe("RESOLVED");
    expect(await disputed()).toBeNull();
    expect((await notificationsOf(prisma, fan.user.id)).at(-1)).toMatchObject({ type: "DISPUTE_DISMISSED", params: { reason: "Inspected: surface is level, puddle is from a blocked drain" } });
    expect((await notificationsOf(prisma, citizen.id)).map((n) => n.type)).not.toContain("DISPUTE_DISMISSED");
    expect((await audits("DISPUTE_DISMISSED"))[0]).toMatchObject({ actorId: roads.admin.id });
    expect((await roads.agent.post(`/api/admin/issues/${issueId}/dispute/dismiss`).send({ reason: "again" })).body.error.code).toBe("NO_DISPUTE");
  });

  it("reopen (admin only): RESOLVED → ACKNOWLEDGED, followers told; reassign; resolve again opens a new feedback round", async () => {
    await resolve();
    await feedback(fan.agent, { verdict: "NOT_FIXED", reason: "Cracked again" });
    expect((await roads.agent.post(`/api/admin/issues/${issueId}/reopen`).send({})).status).toBe(400);
    const res = await roads.agent.post(`/api/admin/issues/${issueId}/reopen`).send({ reason: "Re-inspection failed: crack across the patch" });
    expect(res.status).toBe(200);
    expect(res.body.issue).toMatchObject({ status: "ACKNOWLEDGED", statusReason: "Re-inspection failed: crack across the patch", assignment: null });
    expect(await disputed()).toBeNull();
    for (const u of [citizen, fan.user]) {
      expect((await notificationsOf(prisma, u.id)).at(-1)).toMatchObject({ type: "REOPENED", params: { reason: "Re-inspection failed: crack across the patch" } });
    }
    expect((await audits("ISSUE_REOPENED"))[0].metadata).toMatchObject({ from: "RESOLVED", to: "ACKNOWLEDGED" });
    expect((await feedback(agent, { verdict: "FIXED" })).body.error.code).toBe("NOT_RESOLVED");

    // Follow-up work and a second resolution: everyone can answer again.
    await assign(roads, issueId, worker.contractor.id, inDays(3));
    await resolve();
    expect((await feedback(fan.agent, { verdict: "FIXED" })).status).toBe(201);
    const view = (await roads.agent.get(`/api/issues/${issueId}`)).body.issue;
    expect(view.feedback.current).toMatchObject({ fixed: 1, notFixed: 0 });
    expect(view.feedback.responses.map((r) => r.verdict)).toEqual(["NOT_FIXED", "FIXED"]); // history kept
    expect(view.submissions.map((s) => s.status)).toEqual(["APPROVED", "APPROVED"]);
  });

  it("only from RESOLVED; other departments 404; citizens and contractors 403", async () => {
    expect((await roads.agent.post(`/api/admin/issues/${issueId}/reopen`).send({ reason: "Too early" })).body.error.code).toBe("NOT_RESOLVED");
    await resolve();
    const electrical = await adminOf(prisma, app, "ELECTRICAL");
    expect((await electrical.agent.post(`/api/admin/issues/${issueId}/reopen`).send({ reason: "Mine now" })).status).toBe(404);
    expect((await electrical.agent.post(`/api/admin/issues/${issueId}/dispute/dismiss`).send({ reason: "Nope" })).status).toBe(404);
    expect((await agent.post(`/api/admin/issues/${issueId}/reopen`).send({ reason: "Please" })).status).toBe(403);
    expect((await worker.agent.post(`/api/admin/issues/${issueId}/reopen`).send({ reason: "Please" })).status).toBe(403);
    expect((await issueRow()).status).toBe("RESOLVED");
  });
});
