import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { runDeadlineCheck } from "../src/modules/work/escalation.service.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp } from "./helpers/app.js";
import { citizenSetup, adminOf } from "./helpers/issues.js";
import { notificationsOf } from "./helpers/admin.js";
import { contractorSetup, acceptedIssue, assign, inDays, submitRepair } from "./helpers/work.js";

const HOUR = 60 * 60 * 1000;
let app, agent, roads, backup, worker, issueId, deadline;

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp({ jobs: createMemoryQueue() });
  ({ agent } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
  backup = await adminOf(prisma, app, "CONSTRUCTION"); // the department's backup admin
  worker = await contractorSetup(prisma, app);
  issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads, priority: "HIGH" });
  deadline = inDays(2);
  await assign(roads, issueId, worker.contractor.id, deadline);
});
afterAll(() => prisma.$disconnect());

const at = (ms) => new Date(deadline.getTime() + ms);
const escalatedFlag = () => prisma.issueFlag.findFirst({ where: { issueId, type: "ESCALATED", clearedAt: null } });
const adminEscalations = async (admin) => (await notificationsOf(prisma, admin.admin.id)).filter((n) => n.type === "ESCALATED");

describe("deadline escalation (nothing happens automatically to the contractor)", () => {
  it("before the deadline: nothing", async () => {
    expect(await runDeadlineCheck(prisma, { now: at(-HOUR) })).toEqual({ escalated: [], reminded: [], cleared: [] });
    expect(await escalatedFlag()).toBeNull();
  });

  it("deadline passes, no work started → ESCALATED, admins notified once, no automatic action", async () => {
    const r = await runDeadlineCheck(prisma, { now: at(HOUR) });
    expect(r.escalated).toEqual([issueId]);
    const flag = await escalatedFlag();
    expect(flag.reason).toBe("Deadline passed");
    const audit = await prisma.auditLog.findFirst({ where: { targetId: issueId, action: "FLAG_ADDED", metadata: { path: ["type"], equals: "ESCALATED" } } });
    expect(audit).toMatchObject({ actorId: null }); // the system
    expect(audit.reason).toMatch(/work not started/);

    for (const a of [roads, backup]) {
      expect((await adminEscalations(a)).map((n) => n.params)).toEqual([{ deadlineAt: deadline.toISOString(), workStarted: false, reminder: false }]);
    }
    // Runs every 15 minutes: no second notice an hour later.
    await runDeadlineCheck(prisma, { now: at(2 * HOUR) });
    expect(await adminEscalations(roads)).toHaveLength(1);

    // Nothing happened to the contractor: still assigned, not told, no penalty.
    const assignment = await prisma.assignment.findFirst({ where: { issueId } });
    expect(assignment).toMatchObject({ endedAt: null, contractorId: worker.contractor.id });
    expect((await notificationsOf(prisma, worker.contractor.id)).map((n) => n.type)).toEqual(["ASSIGNED"]);
    expect((await prisma.issue.findUnique({ where: { id: issueId } })).status).toBe("ACKNOWLEDGED");
    // Other departments aren't told.
    const electrical = await adminOf(prisma, app, "ELECTRICAL");
    expect(await adminEscalations(electrical)).toHaveLength(0);
  });

  it("reminders every 24 h while still overdue", async () => {
    await runDeadlineCheck(prisma, { now: at(HOUR) });
    expect((await runDeadlineCheck(prisma, { now: at(20 * HOUR) })).reminded).toEqual([]);
    expect((await runDeadlineCheck(prisma, { now: at(25 * HOUR) })).reminded).toEqual([issueId]);
    expect((await adminEscalations(roads)).map((n) => n.params.reminder)).toEqual([false, true]);
    expect(await prisma.issueFlag.count({ where: { issueId, type: "ESCALATED" } })).toBe(1); // one flag, not one per reminder
  });

  it("deadline passes while evidence awaits review → no escalation (the clock is paused)", async () => {
    await worker.agent.post(`/api/contractor/issues/${issueId}/start`).send({});
    expect((await submitRepair(worker.agent, issueId)).status).toBe(201); // submitted before the deadline
    // Two days after the deadline, the review is still pending: the effective deadline keeps moving.
    const r = await runDeadlineCheck(prisma, { now: at(48 * HOUR) });
    expect(r).toEqual({ escalated: [], reminded: [], cleared: [] });
    expect(await escalatedFlag()).toBeNull();
    expect(await adminEscalations(roads)).toHaveLength(0);
  });

  it("repair sent late (after the deadline): no escalation while it waits for review; escalates if rejected", async () => {
    await worker.agent.post(`/api/contractor/issues/${issueId}/start`).send({});
    await prisma.assignment.updateMany({ where: { issueId }, data: { deadlineAt: new Date(Date.now() - HOUR) } }); // already late
    expect((await submitRepair(worker.agent, issueId)).status).toBe(201);
    expect(await runDeadlineCheck(prisma, { now: new Date(Date.now() + HOUR) })).toEqual({ escalated: [], reminded: [], cleared: [] });
    expect(await escalatedFlag()).toBeNull();

    const s = await prisma.repairSubmission.findFirst({ where: { issueId } });
    await roads.agent.post(`/api/admin/submissions/${s.id}/reject`).send({ reason: "Not finished" });
    expect((await runDeadlineCheck(prisma, { now: new Date(Date.now() + 2 * HOUR) })).escalated).toEqual([issueId]);
  });

  it("the admin extends the deadline → flag cleared right away (audited), notices start fresh if it lapses again", async () => {
    await runDeadlineCheck(prisma, { now: at(HOUR) });
    const later = inDays(10);
    const res = await roads.agent.post(`/api/admin/issues/${issueId}/deadline`).send({ deadlineAt: later, reason: "Rain delay" });
    expect(res.body.issue.flags.map((f) => f.type)).not.toContain("ESCALATED");
    const cleared = await prisma.issueFlag.findFirst({ where: { issueId, type: "ESCALATED" } });
    expect(cleared).toMatchObject({ clearReason: "Deadline extended", clearedById: roads.admin.id });

    const lapse = new Date(later.getTime() + HOUR);
    expect((await runDeadlineCheck(prisma, { now: lapse })).escalated).toEqual([issueId]);
    expect(await adminEscalations(roads)).toHaveLength(2);
  });

  it("the job clears a flag once the issue is no longer overdue (e.g. resolved)", async () => {
    await runDeadlineCheck(prisma, { now: at(HOUR) });
    // Resolved some other way since the last run (simulated): no active assignment any more.
    await prisma.assignment.updateMany({ where: { issueId }, data: { endedAt: new Date(), endReason: "test" } });
    const r = await runDeadlineCheck(prisma, { now: at(2 * HOUR) });
    expect(r.cleared).toEqual([issueId]);
    expect(await escalatedFlag()).toBeNull();
  });

  it("approving the repair clears ESCALATED; reassigning does too", async () => {
    await worker.agent.post(`/api/contractor/issues/${issueId}/start`).send({});
    await runDeadlineCheck(prisma, { now: new Date(Date.now() + 3 * 24 * HOUR) }); // late
    expect(await escalatedFlag()).not.toBeNull();
    const other = await contractorSetup(prisma, app);
    await roads.agent.post(`/api/admin/issues/${issueId}/reassign`).send({ contractorId: other.contractor.id, deadlineAt: inDays(5), reason: "Too slow" });
    expect(await escalatedFlag()).toBeNull();

    await other.agent.post(`/api/contractor/issues/${issueId}/start`).send({});
    await submitRepair(other.agent, issueId);
    await prisma.issueFlag.create({ data: { issueId, type: "ESCALATED", reason: "Deadline passed" } }); // pretend it lapsed
    const s = await prisma.repairSubmission.findFirst({ where: { issueId } });
    const res = await roads.agent.post(`/api/admin/submissions/${s.id}/approve`).send({});
    expect(res.body.issue.status).toBe("RESOLVED");
    expect(await escalatedFlag()).toBeNull();
  });

  it("dashboard counts escalated issues", async () => {
    await runDeadlineCheck(prisma, { now: at(HOUR) });
    expect((await roads.agent.get("/api/admin/dashboard")).body.escalated).toBe(1);
    expect((await roads.agent.get("/api/admin/issues?status=ACTIVE&flag=ESCALATED")).body.items.map((i) => i.id)).toEqual([issueId]);
  });
});
