import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { suggestedDeadline, deadlineDays, effectiveDeadline, pauseData, resumeData } from "../src/modules/work/deadline.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp } from "./helpers/app.js";
import { makeUser } from "./helpers/auth.js";
import { citizenSetup, adminOf } from "./helpers/issues.js";
import { newReport, notificationsOf } from "./helpers/admin.js";
import { contractorSetup, acceptedIssue, assign, inDays, submitRepair } from "./helpers/work.js";

let app, citizen, agent, roads, electrical, worker;

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp({ jobs: createMemoryQueue() });
  ({ citizen, agent } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
  electrical = await adminOf(prisma, app, "ELECTRICAL");
  worker = await contractorSetup(prisma, app);
});
afterAll(() => prisma.$disconnect());

const audits = (issueId, action) => prisma.auditLog.findMany({ where: { targetId: issueId, action }, orderBy: { id: "asc" } });

describe("assign a contractor with a deadline", () => {
  it("ACKNOWLEDGED + priority → assigned; status stays ACKNOWLEDGED; audited; contractor and citizen told", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads, priority: "HIGH" });
    const deadline = inDays(5);
    const res = await assign(roads, issueId, worker.contractor.id, deadline);
    expect(res.status).toBe(200);
    expect(res.body.issue.status).toBe("ACKNOWLEDGED");
    expect(res.body.issue.assignment).toMatchObject({
      contractor: { id: worker.contractor.id, name: worker.contractor.name, workType: "roads", status: "ACTIVE" },
      assignedById: roads.admin.id,
      startedAt: null,
      deadline: { deadlineAt: deadline.toISOString(), effectiveDeadline: deadline.toISOString(), paused: false, pausedSeconds: 0 },
    });
    expect(res.body.issue.suggestedDeadline).toBeNull(); // only offered before assigning

    const row = await prisma.assignment.findFirst({ where: { issueId } });
    expect(row.departmentId).toBe(roads.admin.departmentId); // the assigning department is logged
    const [audit] = await audits(issueId, "ASSIGNMENT_CREATED");
    expect(audit).toMatchObject({ actorId: roads.admin.id });
    expect(audit.metadata).toMatchObject({ contractorId: worker.contractor.id, departmentId: roads.admin.departmentId, deadlineAt: deadline.toISOString() });

    const [toContractor] = await notificationsOf(prisma, worker.contractor.id);
    expect(toContractor).toMatchObject({ type: "ASSIGNED", issueId, params: { audience: "CONTRACTOR", deadlineAt: deadline.toISOString() } });
    expect((await notificationsOf(prisma, citizen.id)).map((n) => [n.type, n.params])).toEqual([["ACKNOWLEDGED", {}], ["ASSIGNED", {}]]);
  });

  it("the review screen offers a default deadline from the priority (OD-5); the admin can choose another", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads, priority: "CRITICAL" });
    const before = Date.now();
    const { body } = await roads.agent.get(`/api/issues/${issueId}`);
    expect(body.issue.deadlineDefaultsDays).toEqual({ LOW: 30, MEDIUM: 14, HIGH: 7, CRITICAL: 2 });
    const offered = new Date(body.issue.suggestedDeadline).getTime();
    expect(offered - before).toBeGreaterThanOrEqual(2 * 24 * 3600 * 1000 - 1000);
    expect(offered - before).toBeLessThan(2 * 24 * 3600 * 1000 + 60_000);

    expect((await assign(roads, issueId, worker.contractor.id, inDays(10))).status).toBe(200); // not the default: fine
    expect(suggestedDeadline(null)).toBeNull();
    expect(deadlineDays({ DEADLINE_DAYS_LOW: 9, DEADLINE_DAYS_MEDIUM: 8, DEADLINE_DAYS_HIGH: 3, DEADLINE_DAYS_CRITICAL: 1 })).toEqual({ LOW: 9, MEDIUM: 8, HIGH: 3, CRITICAL: 1 });
  });

  it("needs: an accepted report, a final priority, a future deadline, no current assignment", async () => {
    const reported = await newReport(agent);
    expect((await assign(roads, reported.id, worker.contractor.id)).body.error.code).toBe("NOT_ACKNOWLEDGED");

    const noPriority = await newReport(agent);
    await roads.agent.post(`/api/admin/issues/${noPriority.id}/accept`).send({});
    expect((await assign(roads, noPriority.id, worker.contractor.id)).body.error.code).toBe("PRIORITY_REQUIRED");

    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    expect((await assign(roads, issueId, worker.contractor.id, inDays(-1))).body.error.code).toBe("DEADLINE_IN_PAST");
    expect((await assign(roads, issueId, worker.contractor.id, inDays(400))).body.error.code).toBe("DEADLINE_TOO_FAR");
    expect((await roads.agent.post(`/api/admin/issues/${issueId}/assign`).send({ contractorId: worker.contractor.id, deadlineAt: "soon" })).status).toBe(400);

    expect((await assign(roads, issueId, worker.contractor.id)).status).toBe(200);
    expect((await assign(roads, issueId, worker.contractor.id)).body.error.code).toBe("ALREADY_ASSIGNED");
  });

  it("two admins assigning at once: the database allows only one active assignment", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    const backup = await adminOf(prisma, app, "CONSTRUCTION");
    const other = await contractorSetup(prisma, app);
    const results = await Promise.all([assign(roads, issueId, worker.contractor.id), assign(backup, issueId, other.contractor.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.assignment.count({ where: { issueId, endedAt: null } })).toBe(1);
  });

  it("only an active contractor who accepted the invite; not a citizen or an admin", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    const pending = await makeUser(prisma, { role: "CONTRACTOR", password: null });
    expect((await assign(roads, issueId, pending.id)).body.error.code).toBe("CONTRACTOR_INVITE_PENDING");
    const gone = await makeUser(prisma, { role: "CONTRACTOR", status: "DEACTIVATED" });
    expect((await assign(roads, issueId, gone.id)).body.error.code).toBe("CONTRACTOR_INACTIVE");
    expect((await assign(roads, issueId, citizen.id)).status).toBe(404);
    expect((await assign(roads, issueId, roads.admin.id)).status).toBe(404);
  });

  it("another department's admin can't assign, reassign or change the deadline (404)", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    expect((await assign(electrical, issueId, worker.contractor.id)).status).toBe(404);
    await assign(roads, issueId, worker.contractor.id);
    const other = await contractorSetup(prisma, app);
    const r1 = await electrical.agent.post(`/api/admin/issues/${issueId}/reassign`).send({ contractorId: other.contractor.id, deadlineAt: inDays(3), reason: "Taking over" });
    const r2 = await electrical.agent.post(`/api/admin/issues/${issueId}/deadline`).send({ deadlineAt: inDays(3), reason: "Hurry" });
    expect([r1.status, r2.status]).toEqual([404, 404]);
  });
});

describe("contractor list for admins (work type is information, not a restriction)", () => {
  it("lists active contractors with active job counts; search; inactive on request", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    await assign(roads, issueId, worker.contractor.id);
    await makeUser(prisma, { role: "CONTRACTOR", name: "Jadhav Electricals", workType: "electrical" });
    await makeUser(prisma, { role: "CONTRACTOR", name: "Old Firm", status: "DEACTIVATED" });

    const all = await electrical.agent.get("/api/admin/contractors"); // any admin sees all contractors
    expect(all.status).toBe(200);
    expect(all.body.contractors).toHaveLength(2);
    expect(all.body.contractors.find((c) => c.id === worker.contractor.id)).toMatchObject({ activeJobs: 1, workType: "roads", invitePending: false });
    expect((await roads.agent.get("/api/admin/contractors?search=electr")).body.contractors.map((c) => c.name)).toEqual(["Jadhav Electricals"]);
    expect((await roads.agent.get("/api/admin/contractors?includeInactive=true")).body.contractors).toHaveLength(3);
    expect((await agent.get("/api/admin/contractors")).status).toBe(403);
    expect((await worker.agent.get("/api/admin/contractors")).status).toBe(403);
  });
});

describe("reassign and change deadline", () => {
  it("deactivated contractor's job: dashboard shows it; admin reassigns with a reason; history kept; both told", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    await assign(roads, issueId, worker.contractor.id);
    await roads.agent.post(`/api/admin/contractors/${worker.contractor.id}/deactivate`).send({ reason: "Licence expired" });
    // Nothing happens automatically: the job is still theirs until an admin reassigns it.
    expect(await prisma.assignment.count({ where: { issueId, endedAt: null } })).toBe(1);
    expect((await roads.agent.get("/api/admin/dashboard")).body.needsReassignment).toBe(1);

    const next = await contractorSetup(prisma, app);
    expect((await roads.agent.post(`/api/admin/issues/${issueId}/reassign`).send({ contractorId: next.contractor.id, deadlineAt: inDays(4) })).status).toBe(400); // reason
    const res = await roads.agent.post(`/api/admin/issues/${issueId}/reassign`).send({ contractorId: next.contractor.id, deadlineAt: inDays(4), reason: "Previous contractor deactivated" });
    expect(res.status).toBe(200);
    expect(res.body.issue.assignment.contractor.id).toBe(next.contractor.id);
    expect(res.body.issue.pastAssignments).toMatchObject([{ contractor: { id: worker.contractor.id, status: "DEACTIVATED" }, endReason: "Previous contractor deactivated" }]);
    expect((await roads.agent.get("/api/admin/dashboard")).body.needsReassignment).toBe(0);

    expect((await notificationsOf(prisma, worker.contractor.id)).map((n) => n.type)).toEqual(["ASSIGNED", "ASSIGNMENT_ENDED"]);
    expect((await notificationsOf(prisma, next.contractor.id)).map((n) => n.type)).toEqual(["ASSIGNED"]);
    expect((await audits(issueId, "ASSIGNMENT_ENDED"))[0].reason).toBe("Previous contractor deactivated");
  });

  it("not to the same contractor, not before assigning, not while a repair waits for review", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    const other = await contractorSetup(prisma, app);
    const reassign = (contractorId) => roads.agent.post(`/api/admin/issues/${issueId}/reassign`).send({ contractorId, deadlineAt: inDays(4), reason: "Change" });
    expect((await reassign(other.contractor.id)).body.error.code).toBe("NOT_ASSIGNED");
    await assign(roads, issueId, worker.contractor.id);
    expect((await reassign(worker.contractor.id)).body.error.code).toBe("SAME_CONTRACTOR");

    await worker.agent.post(`/api/contractor/issues/${issueId}/start`).send({});
    expect((await submitRepair(worker.agent, issueId)).status).toBe(201);
    expect((await reassign(other.contractor.id)).body.error.code).toBe("SUBMISSION_PENDING");
  });

  it("the admin changes the deadline with a reason; audited; the contractor is told", async () => {
    const issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
    const first = inDays(7);
    await assign(roads, issueId, worker.contractor.id, first);
    const later = inDays(12);
    const res = await roads.agent.post(`/api/admin/issues/${issueId}/deadline`).send({ deadlineAt: later, reason: "Monsoon rain" });
    expect(res.body.issue.assignment.deadline.deadlineAt).toBe(later.toISOString());
    const [audit] = await audits(issueId, "DEADLINE_SET");
    expect(audit).toMatchObject({ reason: "Monsoon rain" });
    expect(audit.metadata).toMatchObject({ from: first.toISOString(), to: later.toISOString() });
    const n = (await notificationsOf(prisma, worker.contractor.id)).at(-1);
    expect(n).toMatchObject({ type: "DEADLINE_CHANGED", params: { deadlineAt: later.toISOString(), reason: "Monsoon rain" } });
  });
});

describe("deadline clock (pauses while a submission awaits review)", () => {
  it("adds paused time, including a pause still running", () => {
    const deadlineAt = new Date("2026-10-20T10:00:00Z");
    const t0 = new Date("2026-10-18T10:00:00Z");
    let a = { deadlineAt, pausedSince: null, pausedSeconds: 0 };
    expect(effectiveDeadline(a, t0)).toEqual(deadlineAt);

    a = { ...a, ...pauseData(a, t0) }; // submission arrives
    const t1 = new Date("2026-10-18T16:00:00Z");
    expect(effectiveDeadline(a, t1)).toEqual(new Date("2026-10-20T16:00:00Z")); // 6 h paused so far
    expect(pauseData(a, t1)).toEqual({}); // already paused

    a = { ...a, ...resumeData(a, new Date("2026-10-19T10:00:00Z")) }; // reviewed after 24 h
    expect(a).toMatchObject({ pausedSince: null, pausedSeconds: 24 * 3600 });
    expect(effectiveDeadline(a, new Date("2026-10-25T00:00:00Z"))).toEqual(new Date("2026-10-21T10:00:00Z"));
    expect(resumeData(a, new Date())).toEqual({}); // not paused
  });
});
