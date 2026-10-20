// Phase 7a: the citizen's issue timeline (from the audit log) and "Supporting" in My complaints.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { makeUser, loginAgent } from "./helpers/auth.js";
import { citizenSetup, report, adminOf } from "./helpers/issues.js";
import { acceptedIssue, assign, contractorSetup } from "./helpers/work.js";

let app, agent, admin;

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp({ jobs: createMemoryQueue(), storage: tempStorage() });
  ({ agent } = await citizenSetup(prisma, app));
  admin = await adminOf(prisma, app, "CONSTRUCTION");
});
afterAll(() => prisma.$disconnect());

const otherCitizen = async () => loginAgent(app, (await makeUser(prisma, { emailVerified: true })).email);
const timelineOf = async (a, id) => (await a.get(`/api/issues/${id}`)).body.issue.timeline;

describe("timeline in the citizen issue view", () => {
  it("lists reported → acknowledged → assigned → in progress, oldest first, without internal details", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin });
    const { contractor, agent: contractorAgent } = await contractorSetup(prisma, app);
    expect((await assign(admin, issueId, contractor.id)).status).toBe(200);
    expect((await contractorAgent.post(`/api/contractor/issues/${issueId}/start`)).status).toBe(200);

    const timeline = await timelineOf(agent, issueId);
    expect(timeline.map((e) => e.type)).toEqual(["REPORTED", "ACKNOWLEDGED", "ASSIGNED", "IN_PROGRESS"]);
    for (const e of timeline) expect(new Date(e.at).getTime()).not.toBeNaN();
    // No contractor identity, deadline, priority or system reasons.
    expect(JSON.stringify(timeline)).not.toContain(contractor.id);
    expect(timeline.find((e) => e.type === "ASSIGNED")).toEqual({ type: "ASSIGNED", at: expect.any(String) });
    expect(timeline.find((e) => e.type === "ACKNOWLEDGED").reason).toBeUndefined();
  });

  it("a rejection carries its type and the admin's reason (the citizen is always told why)", async () => {
    const issue = (await report(agent)).body.issue;
    await admin.agent.post(`/api/admin/issues/${issue.id}/forward`).send({ reason: "State highway: sent to PWD" });
    const timeline = await timelineOf(agent, issue.id);
    expect(timeline.at(-1)).toMatchObject({ type: "REJECTED", rejectionType: "NOT_OUR_JURISDICTION", reason: "State highway: sent to PWD" });
  });

  it("a reroute shows both categories and the reason", async () => {
    const issue = (await report(agent)).body.issue;
    const res = await admin.agent.post(`/api/admin/issues/${issue.id}/reroute`).send({ categoryKey: "GARBAGE", reason: "It is a dumping spot" });
    expect(res.status).toBe(200);
    expect((await timelineOf(agent, issue.id)).at(-1)).toMatchObject({ type: "REROUTED", fromCategory: "ROADS", toCategory: "GARBAGE", reason: "It is a dumping spot" });
  });

  it("is not part of the admin view", async () => {
    const issue = (await report(agent)).body.issue;
    expect((await admin.agent.get(`/api/issues/${issue.id}`)).body.issue.timeline).toBeUndefined();
  });
});

describe("GET /api/issues/supporting", () => {
  it("lists the issues I support (newest support first), not my own or others'", async () => {
    const otherAgent = await otherCitizen();
    const a = (await report(otherAgent, { description: "pothole near the bus stand" })).body.issue;
    const b = (await report(otherAgent, { description: "another pothole near the market" })).body.issue;
    await report(agent, { description: "my own report here" });

    expect((await agent.post(`/api/issues/${a.id}/support`).send({ fromDuplicatePopup: true })).status).toBe(200);
    expect((await agent.post(`/api/issues/${b.id}/support`).send({})).status).toBe(200);

    const res = await agent.get("/api/issues/supporting");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 2, page: 1 });
    expect(res.body.items.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(res.body.items[0]).toMatchObject({ status: "REPORTED", supportedAt: expect.any(String) });
    expect(res.body.items[0].flags).toBeUndefined();

    // A supporter can open the issue, timeline included, and is told they are a supporter.
    expect((await timelineOf(agent, a.id)).map((e) => e.type)).toEqual(["REPORTED"]);
    expect((await agent.get(`/api/issues/${a.id}`)).body.issue.relation).toBe("SUPPORTER");
    expect((await otherAgent.get(`/api/issues/${a.id}`)).body.issue.relation).toBe("REPORTER");
    expect((await otherAgent.get("/api/issues/supporting")).body.total).toBe(0);
  });

  it("is for citizens only", async () => {
    expect((await admin.agent.get("/api/issues/supporting")).status).toBe(403);
  });
});
