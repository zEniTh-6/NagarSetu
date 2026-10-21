// Phase 7d: contractor app endpoints — job stages, completed jobs, department note, capture source,
// profile, and that a contractor never sees someone else's job (D-027).
import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { citizenSetup, adminOf } from "./helpers/issues.js";
import { contractorSetup, acceptedIssue, inDays, submitRepair } from "./helpers/work.js";

let app, agent, roads, worker, other, issueId;

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp({ jobs: createMemoryQueue(), storage: tempStorage() });
  ({ agent } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
  worker = await contractorSetup(prisma, app);
  other = await contractorSetup(prisma, app, { phone: "+91 98220 99999" });
  issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads });
});
afterAll(() => prisma.$disconnect());

const assignWithNote = (contractorId, note) =>
  roads.agent.post(`/api/admin/issues/${issueId}/assign`).send({ contractorId, deadlineAt: inDays(7).toISOString(), ...(note !== undefined ? { note } : {}) });
const job = async (a = worker.agent) => (await a.get(`/api/contractor/issues/${issueId}`)).body.job;
const pending = () => prisma.repairSubmission.findFirst({ where: { issueId, status: "SUBMITTED" } });

describe("job view for the contractor", () => {
  it("shows the assigning department and the admin's note as written; the admin sees the note too", async () => {
    const note = "Use hot-mix, not cold-mix. Barricade the lane first.";
    expect((await assignWithNote(worker.contractor.id, `  ${note}  `)).status).toBe(200);
    const j = await job();
    const dept = await prisma.department.findUnique({ where: { code: "CONSTRUCTION" } });
    expect(j).toMatchObject({ stage: "NEW", department: { name: dept.name }, note, location: expect.any(Object), completedAt: null });
    expect(j.reporter).toBeUndefined();
    expect((await roads.agent.get(`/api/issues/${issueId}`)).body.issue.assignment.note).toBe(note);
    const audit = await prisma.auditLog.findFirst({ where: { action: "ASSIGNMENT_CREATED", targetId: issueId } });
    expect(audit.metadata.note).toBe(note);
  });

  it("no note → null; a note over 1000 characters is refused", async () => {
    expect((await assignWithNote(worker.contractor.id, "x".repeat(1001))).status).toBe(400);
    expect((await assignWithNote(worker.contractor.id, "   ")).status).toBe(200);
    expect((await job()).note).toBeNull();
  });

  it("stages: NEW → IN_PROGRESS → SUBMITTED → REWORK → SUBMITTED → COMPLETED (read-only afterwards)", async () => {
    await assignWithNote(worker.contractor.id);
    expect((await job()).stage).toBe("NEW");
    expect((await worker.agent.post(`/api/contractor/issues/${issueId}/start`)).body.job.stage).toBe("IN_PROGRESS");
    expect((await submitRepair(worker.agent, issueId, { captureSource: "CAMERA" })).body.job.stage).toBe("SUBMITTED");
    await roads.agent.post(`/api/admin/submissions/${(await pending()).id}/reject`).send({ reason: "Edges not sealed" });
    const rework = await job();
    expect(rework.stage).toBe("REWORK");
    expect(rework.submissions.at(-1)).toMatchObject({ status: "REJECTED", reviewReason: "Edges not sealed", captureSource: "CAMERA" });
    expect((await submitRepair(worker.agent, issueId, { captureSource: "CAMERA" })).body.job.stage).toBe("SUBMITTED");
    await roads.agent.post(`/api/admin/submissions/${(await pending()).id}/approve`).send({});

    // Completed: off the active list, on the completed list, still readable, nothing more to do.
    expect((await worker.agent.get("/api/contractor/issues")).body.items).toEqual([]);
    const done = (await worker.agent.get("/api/contractor/issues?state=completed")).body;
    expect(done).toMatchObject({ total: 1, page: 1 });
    expect(done.items[0]).toMatchObject({ issueId, stage: "COMPLETED", status: "RESOLVED", completedAt: expect.any(String) });
    expect(done.items[0].submissions.map((s) => s.status)).toEqual(["REJECTED", "APPROVED"]);
    const j = await job();
    expect(j.stage).toBe("COMPLETED");
    expect((await worker.agent.get(j.photo.url)).status).toBe(200);
    expect((await worker.agent.get(j.submissions[1].photo.url)).status).toBe(200);
    expect((await worker.agent.post(`/api/contractor/issues/${issueId}/start`)).status).toBe(404);
    expect((await submitRepair(worker.agent, issueId)).status).toBe(404);
  });
});

describe("a contractor never sees someone else's job", () => {
  it("another contractor gets 404 for the job, its photos and its evidence, and it is in none of their lists", async () => {
    await assignWithNote(worker.contractor.id);
    await worker.agent.post(`/api/contractor/issues/${issueId}/start`);
    await submitRepair(worker.agent, issueId);
    const mine = await job();

    expect((await other.agent.get(`/api/contractor/issues/${issueId}`)).status).toBe(404);
    expect((await other.agent.post(`/api/contractor/issues/${issueId}/start`)).status).toBe(404);
    expect((await submitRepair(other.agent, issueId)).status).toBe(404);
    expect((await other.agent.get(mine.photo.url)).status).toBe(404);
    expect((await other.agent.get(mine.submissions[0].photo.url)).status).toBe(404);
    expect((await other.agent.get("/api/contractor/issues")).body.items).toEqual([]);

    await roads.agent.post(`/api/admin/submissions/${(await pending()).id}/approve`).send({});
    expect((await other.agent.get(`/api/contractor/issues/${issueId}`)).status).toBe(404);
    expect((await other.agent.get("/api/contractor/issues?state=completed")).body.total).toBe(0);
    // Not reachable through the citizen or admin routes either.
    expect((await other.agent.get(`/api/issues/${issueId}`)).status).toBe(404);
    expect((await other.agent.get("/api/admin/issues")).status).toBe(403);
  });

  it("a contractor whose job was given to someone else loses access (it never counts as completed)", async () => {
    await assignWithNote(worker.contractor.id);
    await worker.agent.post(`/api/contractor/issues/${issueId}/start`);
    const photoUrl = (await job()).photo.url;
    const res = await roads.agent
      .post(`/api/admin/issues/${issueId}/reassign`)
      .send({ contractorId: other.contractor.id, deadlineAt: inDays(5).toISOString(), reason: "Not started on time", note: "Start tomorrow morning" });
    expect(res.status).toBe(200);
    expect((await worker.agent.get(`/api/contractor/issues/${issueId}`)).status).toBe(404);
    expect((await worker.agent.get(photoUrl)).status).toBe(404);
    expect((await worker.agent.get("/api/contractor/issues?state=completed")).body.total).toBe(0);
    expect(await job(other.agent)).toMatchObject({ stage: "NEW", note: "Start tomorrow morning" });
  });
});

describe("evidence: capture source and retries", () => {
  beforeEach(async () => {
    await assignWithNote(worker.contractor.id);
    await worker.agent.post(`/api/contractor/issues/${issueId}/start`);
  });

  it("records camera vs gallery and shows it to the admin; only a signal (nothing is rejected or flagged)", async () => {
    expect((await submitRepair(worker.agent, issueId, { captureSource: "GALLERY" })).status).toBe(201);
    const s = (await roads.agent.get(`/api/issues/${issueId}`)).body.issue.submissions[0];
    expect(s).toMatchObject({ status: "SUBMITTED", captureSource: "GALLERY" });
    expect(await prisma.issueFlag.count({ where: { issueId, clearedAt: null, type: "SUSPICIOUS" } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({ where: { action: "SUBMISSION_CREATED", targetId: issueId } });
    expect(audit.metadata.captureSource).toBe("GALLERY");
  });

  it("an unknown source is refused; leaving it out is allowed (older app versions)", async () => {
    expect((await submitRepair(worker.agent, issueId, { captureSource: "SCREENSHOT" })).status).toBe(400);
    expect((await submitRepair(worker.agent, issueId)).status).toBe(201);
    expect((await roads.agent.get(`/api/issues/${issueId}`)).body.issue.submissions[0].captureSource).toBeNull();
  });

  it("a retry with the same request ID returns the first submission (capture time and source kept)", async () => {
    const clientRequestId = crypto.randomUUID();
    const capturedAt = "2026-10-20T08:55:00.000Z";
    const first = await submitRepair(worker.agent, issueId, { clientRequestId, capturedAt, captureSource: "CAMERA" });
    const again = await submitRepair(worker.agent, issueId, { clientRequestId, capturedAt: "2026-10-20T09:30:00.000Z", captureSource: "GALLERY" });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.duplicateRequest).toBe(true);
    const rows = await prisma.repairSubmission.findMany({ where: { issueId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ captureSource: "CAMERA", capturedAt: new Date(capturedAt) });
  });
});

describe("GET /api/contractor/me", () => {
  it("returns the contractor's own details and job counts; contractors only", async () => {
    await assignWithNote(worker.contractor.id);
    const res = await worker.agent.get("/api/contractor/me");
    expect(res.status).toBe(200);
    expect(res.body.contractor).toMatchObject({ id: worker.contractor.id, name: worker.contractor.name, phone: "+91 98220 00000", workType: "roads", activeJobs: 1, completedJobs: 0 });
    expect(res.body.contractor.passwordHash).toBeUndefined();
    expect((await roads.agent.get("/api/contractor/me")).status).toBe(403);
    expect((await agent.get("/api/contractor/me")).status).toBe(403);
  });

  it("a deactivated contractor is blocked", async () => {
    await prisma.user.update({ where: { id: worker.contractor.id }, data: { status: "DEACTIVATED" } });
    const res = await worker.agent.get("/api/contractor/issues");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DEACTIVATED");
  });
});
