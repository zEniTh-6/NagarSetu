// Phase 7c: admin queues, issues table additions, citizen suspension, contractor jobs, audit log (D-026).
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { loginAgent } from "./helpers/auth.js";
import { citizenSetup, adminOf } from "./helpers/issues.js";
import { newReport, setAi, anotherCitizen } from "./helpers/admin.js";
import { contractorSetup, acceptedIssue, assign, inDays, submitRepair } from "./helpers/work.js";

let app, citizen, agent, roads, swm, worker;

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp({ jobs: createMemoryQueue(), storage: tempStorage() });
  ({ citizen, agent } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
  swm = await adminOf(prisma, app, "SOLID_WASTE");
  worker = await contractorSetup(prisma, app);
});
afterAll(() => prisma.$disconnect());

/** Accepted, assigned, started and with a repair waiting for review. */
async function withEvidence() {
  const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
  await assign(roads, issueId, worker.contractor.id, inDays(7));
  await worker.agent.post(`/api/contractor/issues/${issueId}/start`).send({});
  expect((await submitRepair(worker.agent, issueId)).status).toBe(201);
  return issueId;
}

describe("issues table additions", () => {
  it("searches by reference, description and address; filters by date and 'evidence to verify'; shows assignee and deadline", async () => {
    const a = await newReport(agent, { description: "Pothole near Rajwada chowk", addressText: "Station Road" });
    const b = await newReport(agent, { description: "Broken footpath tiles here" });
    const list = async (qs) => (await roads.agent.get(`/api/admin/issues?status=ALL&${qs}`)).body;

    expect((await list("q=rajwada")).items.map((i) => i.id)).toEqual([a.id]);
    expect((await list("q=station")).items.map((i) => i.id)).toEqual([a.id]);
    expect((await list(`q=%23${b.id.slice(0, 6)}`)).items.map((i) => i.id)).toEqual([b.id]);
    expect((await list(`from=${new Date(Date.now() + 60_000).toISOString()}`)).total).toBe(0);
    expect((await list(`to=${new Date(Date.now() + 60_000).toISOString()}`)).total).toBe(2);

    const issueId = await withEvidence();
    const rows = (await list("stage=REPAIR_REVIEW")).items;
    expect(rows.map((i) => i.id)).toEqual([issueId]);
    expect(rows[0]).toMatchObject({
      repairToReview: true,
      assignment: { contractor: { id: worker.contractor.id, name: worker.contractor.name }, overdue: false, deadline: { paused: true } },
    });
    // Another department's search finds nothing of ours.
    expect((await swm.agent.get("/api/admin/issues?status=ALL&q=rajwada")).body.total).toBe(0);
  });

  it("marks an assignment overdue once its effective deadline passed", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    await assign(roads, issueId, worker.contractor.id, inDays(1));
    await prisma.assignment.updateMany({ where: { issueId }, data: { deadlineAt: inDays(-1) } });
    const [row] = (await roads.agent.get("/api/admin/issues?status=ACTIVE")).body.items;
    expect(row.assignment.overdue).toBe(true);
  });

  it("dashboard has new-in-24h and in-progress counts", async () => {
    await newReport(agent);
    const old = await newReport(agent);
    await prisma.issue.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
    const d = (await roads.agent.get("/api/admin/dashboard")).body;
    expect(d).toMatchObject({ newLast24h: 1, waitingForReview: 2, inProgress: 0 });
  });
});

describe("evidence to verify", () => {
  it("lists waiting repair submissions with the issue and contractor; department-scoped", async () => {
    const issueId = await withEvidence();
    const res = await roads.agent.get("/api/admin/submissions");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      status: "SUBMITTED",
      contractor: { id: worker.contractor.id },
      issue: { id: issueId, category: { key: "ROADS" } },
      photo: { url: expect.stringMatching(/^\/api\/photos\//) },
    });
    expect((await swm.agent.get("/api/admin/submissions")).body.total).toBe(0);
    expect((await agent.get("/api/admin/submissions")).status).toBe(403);
  });
});

describe("disputes queue", () => {
  it("shows before/after and the citizens' 'not fixed' reasons", async () => {
    const issueId = await withEvidence();
    const s = await prisma.repairSubmission.findFirst({ where: { issueId } });
    await roads.agent.post(`/api/admin/submissions/${s.id}/approve`).send({});
    const fb = await agent.post(`/api/issues/${issueId}/feedback`).field("verdict", "NOT_FIXED").field("reason", "Water still collects here");
    expect(fb.status).toBe(201);

    const res = await roads.agent.get("/api/admin/disputes");
    expect(res.body.total).toBe(1);
    const d = res.body.items[0];
    expect(d).toMatchObject({ id: issueId, status: "RESOLVED", counts: { notFixed: 1 } });
    expect(d.before.url).toMatch(/^\/api\/photos\//);
    expect(d.after.url).toMatch(/^\/api\/photos\//);
    expect(d.notFixed).toEqual([expect.objectContaining({ verdict: "NOT_FIXED", reason: "Water still collects here", by: { id: citizen.id, name: citizen.name } })]);
    expect((await swm.agent.get("/api/admin/disputes")).body.total).toBe(0);
  });
});

describe("comment moderation queue", () => {
  it("reported comments (most reported first), then hidden ones; only the department's", async () => {
    const issue = await newReport(agent);
    await setAi(prisma, issue.id, { verdict: "VALID" });
    const troll = await anotherCitizen(prisma, app);
    const c1 = (await troll.agent.post(`/api/issues/${issue.id}/comments`).send({ body: "spam spam" })).body.comment;
    const c2 = (await troll.agent.post(`/api/issues/${issue.id}/comments`).send({ body: "rude words" })).body.comment;
    const other = await anotherCitizen(prisma, app);
    await agent.post(`/api/comments/${c2.id}/report`).send({ reason: "ABUSIVE" });
    await other.agent.post(`/api/comments/${c2.id}/report`).send({ reason: "ABUSIVE", note: "insults" });
    await agent.post(`/api/comments/${c1.id}/report`).send({ reason: "SPAM" });

    const reported = (await roads.agent.get("/api/admin/comments")).body;
    expect(reported.items.map((c) => c.id)).toEqual([c2.id, c1.id]);
    expect(reported.items[0]).toMatchObject({ author: { id: troll.user.id, status: "ACTIVE" }, reports: { total: 2 }, issue: { id: issue.id } });

    await roads.agent.post(`/api/admin/comments/${c2.id}/hide`).send({ reason: "Abusive" });
    expect((await roads.agent.get("/api/admin/comments")).body.items.map((c) => c.id)).toEqual([c1.id]);
    expect((await roads.agent.get("/api/admin/comments?filter=hidden")).body.items.map((c) => c.id)).toEqual([c2.id]);
    expect((await swm.agent.get("/api/admin/comments")).body.total).toBe(0);
  });
});

describe("suspending and reactivating a citizen (D-026)", () => {
  it("needs a link to the department; blocks the account; reason audited; reactivation works", async () => {
    const issue = await newReport(agent);
    await setAi(prisma, issue.id, { verdict: "VALID" });
    const troll = await anotherCitizen(prisma, app);
    await troll.agent.post(`/api/issues/${issue.id}/comments`).send({ body: "abusive words" });
    const stranger = await anotherCitizen(prisma, app);

    expect((await roads.agent.post(`/api/admin/citizens/${troll.user.id}/suspend`).send({})).status).toBe(400);
    expect((await swm.agent.post(`/api/admin/citizens/${troll.user.id}/suspend`).send({ reason: "Not ours" })).status).toBe(404);
    expect((await roads.agent.post(`/api/admin/citizens/${stranger.user.id}/suspend`).send({ reason: "No link" })).status).toBe(404);
    expect((await roads.agent.post(`/api/admin/citizens/${worker.contractor.id}/suspend`).send({ reason: "Not a citizen" })).status).toBe(404);
    expect((await agent.post(`/api/admin/citizens/${troll.user.id}/suspend`).send({ reason: "I dislike them" })).status).toBe(403);

    const res = await roads.agent.post(`/api/admin/citizens/${troll.user.id}/suspend`).send({ reason: "Repeated abusive comments" });
    expect(res.status).toBe(200);
    expect(res.body.citizen).toMatchObject({ id: troll.user.id, status: "DEACTIVATED" });
    expect((await troll.agent.get("/api/auth/me")).body.error.code).toBe("ACCOUNT_DEACTIVATED");
    expect(await prisma.auditLog.findFirst({ where: { action: "USER_DEACTIVATED", targetId: troll.user.id } })).toMatchObject({
      actorId: roads.admin.id,
      reason: "Repeated abusive comments",
    });
    expect((await roads.agent.post(`/api/admin/citizens/${troll.user.id}/suspend`).send({ reason: "again" })).body.error.code).toBe("ALREADY_SUSPENDED");
    // Comments stay (hidden one by one by the admin).
    expect(await prisma.comment.count({ where: { authorId: troll.user.id, hiddenAt: null } })).toBe(1);

    const suspended = (await roads.agent.get("/api/admin/citizens/suspended")).body;
    expect(suspended.items).toEqual([expect.objectContaining({ id: troll.user.id, reason: "Repeated abusive comments", by: { id: roads.admin.id, name: roads.admin.name } })]);
    expect((await swm.agent.get("/api/admin/citizens/suspended")).body.total).toBe(0);

    const back = await roads.agent.post(`/api/admin/citizens/${troll.user.id}/reactivate`).send({ reason: "Apologised" });
    expect(back.body.citizen.status).toBe("ACTIVE");
    expect(await prisma.auditLog.count({ where: { action: "USER_REACTIVATED", targetId: troll.user.id } })).toBe(1);
    await loginAgent(app, troll.user.email); // throws unless the login works again
    expect((await roads.agent.post(`/api/admin/citizens/${troll.user.id}/reactivate`).send({ reason: "again" })).body.error.code).toBe("NOT_SUSPENDED");
  });
});

describe("contractor jobs before deactivating", () => {
  it("details for my department, only a count for others", async () => {
    const mine = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    await assign(roads, mine, worker.contractor.id, inDays(7));
    const bin = await newReport(agent, { categoryKey: "GARBAGE", description: "overflowing bin at the corner" });
    await setAi(prisma, bin.id);
    await swm.agent.post(`/api/admin/issues/${bin.id}/accept`).send({ priority: "MEDIUM" });
    await assign(swm, bin.id, worker.contractor.id, inDays(7));

    const res = await roads.agent.get(`/api/admin/contractors/${worker.contractor.id}/jobs`);
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([expect.objectContaining({ issue: expect.objectContaining({ id: mine }), overdue: false })]);
    expect(res.body.otherDepartmentsJobs).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain(bin.id);
    expect((await roads.agent.get(`/api/admin/contractors/${citizen.id}/jobs`)).status).toBe(404);
  });
});

describe("audit log (read-only, department-scoped)", () => {
  it("shows my department's issue rows and my admins' actions, never another department's", async () => {
    const mine = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    await assign(roads, mine, worker.contractor.id, inDays(7));
    const bin = await newReport(agent, { categoryKey: "GARBAGE", description: "overflowing bin at the corner" });
    await swm.agent.post(`/api/admin/issues/${bin.id}/reject`).send({ type: "OTHER", reason: "Private land" });
    const contractor = await roads.agent.post("/api/admin/contractors").send({ name: "Shinde Civils", phone: "+91 98220 11111", email: "shinde@example.com" });
    expect(contractor.status).toBe(201);

    const log = (await roads.agent.get("/api/admin/audit-log")).body;
    const actions = log.items.map((i) => i.action);
    expect(actions).toEqual(expect.arrayContaining(["ISSUE_CREATED", "ISSUE_STATUS_CHANGED", "ASSIGNMENT_CREATED", "USER_CREATED", "INVITE_CREATED"]));
    expect(JSON.stringify(log)).not.toContain(bin.id);
    expect(log.items.find((i) => i.action === "ASSIGNMENT_CREATED")).toMatchObject({ issueId: mine, actor: { id: roads.admin.id, role: "ADMIN" } });
    // Newest first.
    const times = log.items.map((i) => new Date(i.at).getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);

    const swmLog = (await swm.agent.get("/api/admin/audit-log")).body;
    expect(JSON.stringify(swmLog)).not.toContain(mine);
    expect(swmLog.items.some((i) => i.issueId === bin.id)).toBe(true);
  });

  it("filters by action, actor, target, issue reference and date; pages", async () => {
    const mine = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    const other = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads, fields: { description: "second pothole report" } });
    const q = async (qs) => (await roads.agent.get(`/api/admin/audit-log?${qs}`)).body;

    expect((await q("action=ISSUE_CREATED")).items.every((i) => i.action === "ISSUE_CREATED")).toBe(true);
    expect((await q("actor=CITIZEN")).items.every((i) => i.actor?.role === "CITIZEN")).toBe(true);
    expect((await q("actor=ME")).items.every((i) => i.actor?.id === roads.admin.id)).toBe(true);
    expect((await q("target=USER")).items.every((i) => i.target.type === "USER")).toBe(true);
    const byRef = (await q(`issue=%23${mine.slice(0, 8)}`)).items;
    expect(byRef.length).toBeGreaterThan(0);
    expect(byRef.every((i) => i.issueId === mine)).toBe(true);
    expect(byRef.some((i) => i.issueId === other)).toBe(false);
    expect((await q(`from=${new Date(Date.now() + 60_000).toISOString()}`)).total).toBe(0);
    const page = await q("pageSize=1&page=2");
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThan(1);
    expect((await roads.agent.get("/api/admin/audit-log?action=NOPE")).status).toBe(400);
    expect((await q("issue=not-a-ref")).total).toBe(0);
    expect((await agent.get("/api/admin/audit-log")).status).toBe(403);
  });
});
