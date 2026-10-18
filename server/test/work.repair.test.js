import { describe, it, expect, beforeEach, afterAll } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { runRepairValidation, MAX_REPAIR_CHECK_ATTEMPTS } from "../src/modules/work/repairs.service.js";
import { classifyRepairGps } from "../src/modules/work/contractorWork.service.js";
import { buildRepairPrompt } from "../src/ai/repairCheck.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { citizenSetup, adminOf, SANGLI } from "./helpers/issues.js";
import { anotherCitizen, notificationsOf } from "./helpers/admin.js";
import { contractorSetup, acceptedIssue, assign, inDays, submitRepair, fakeRepairValidator } from "./helpers/work.js";

let app, jobs, storage, citizen, agent, roads, worker, issueId;

beforeEach(async () => {
  await resetDb(prisma);
  jobs = createMemoryQueue();
  storage = tempStorage();
  app = makeTestApp({ jobs, storage });
  ({ citizen, agent } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
  worker = await contractorSetup(prisma, app);
  issueId = await acceptedIssue(prisma, { citizenAgent: agent, admin: roads, priority: "HIGH" });
  await assign(roads, issueId, worker.contractor.id, inDays(7));
});
afterAll(() => prisma.$disconnect());

const start = (a = worker.agent) => a.post(`/api/contractor/issues/${issueId}/start`).send({});
const latestSubmission = () => prisma.repairSubmission.findFirst({ where: { issueId }, orderBy: { createdAt: "desc" } });
const audits = (action) => prisma.auditLog.findMany({ where: { targetId: issueId, action }, orderBy: { id: "asc" } });
const approve = (id, body = {}) => roads.agent.post(`/api/admin/submissions/${id}/approve`).send(body);
const reject = (id, body) => roads.agent.post(`/api/admin/submissions/${id}/reject`).send(body);

describe("contractor sees only their own assigned issues", () => {
  it("job list and detail: exact location, description, photo, priority, deadline; no reporter details", async () => {
    const list = await worker.agent.get("/api/contractor/issues");
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const job = (await worker.agent.get(`/api/contractor/issues/${issueId}`)).body.job;
    expect(job).toMatchObject({
      issueId,
      status: "ACKNOWLEDGED",
      category: { key: "ROADS" },
      location: { lat: expect.closeTo(SANGLI.lat, 6), lng: expect.closeTo(SANGLI.lng, 6) },
      priority: "HIGH",
      startedAt: null,
      deadline: { paused: false },
      submissions: [],
    });
    expect(job.description).toMatch(/pothole/);
    expect(JSON.stringify(job)).not.toContain(citizen.email);
    expect(job.reporter).toBeUndefined();
    expect(job.ai).toBeUndefined();

    // The citizen's photo (public copy) is viewable; the original with EXIF is not.
    expect((await worker.agent.get(job.photo.url)).status).toBe(200);
    expect((await worker.agent.get(`${job.photo.url}?variant=original`)).status).toBe(404);
  });

  it("another contractor, an unassigned issue, or a lost job → 404; citizens/admins → 403", async () => {
    const other = await contractorSetup(prisma, app);
    expect((await other.agent.get("/api/contractor/issues")).body.items).toEqual([]);
    expect((await other.agent.get(`/api/contractor/issues/${issueId}`)).status).toBe(404);
    expect((await other.agent.post(`/api/contractor/issues/${issueId}/start`).send({})).status).toBe(404);
    expect((await submitRepair(other.agent, issueId)).status).toBe(404);
    const photo = (await worker.agent.get(`/api/contractor/issues/${issueId}`)).body.job.photo;
    expect((await other.agent.get(photo.url)).status).toBe(404);
    expect((await other.agent.get(`/api/issues/${issueId}`)).status).toBe(404);

    // After a reassignment, the first contractor loses access.
    await roads.agent.post(`/api/admin/issues/${issueId}/reassign`).send({ contractorId: other.contractor.id, deadlineAt: inDays(3), reason: "Faster crew" });
    expect((await worker.agent.get(`/api/contractor/issues/${issueId}`)).status).toBe(404);
    expect((await worker.agent.get(photo.url)).status).toBe(404);
    expect((await other.agent.get(`/api/contractor/issues/${issueId}`)).status).toBe(200);

    expect((await agent.get("/api/contractor/issues")).status).toBe(403);
    expect((await roads.agent.get("/api/contractor/issues")).status).toBe(403);
    expect((await request(app).get("/api/contractor/issues")).status).toBe(401);
  });
});

describe("start work", () => {
  it("ACKNOWLEDGED → IN_PROGRESS; audited; reporter and supporters told; only once", async () => {
    const fan = await anotherCitizen(prisma, app);
    await fan.agent.post(`/api/issues/${issueId}/support`).send({});
    const res = await start();
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({ status: "IN_PROGRESS", startedAt: expect.any(String) });
    expect((await audits("ISSUE_STATUS_CHANGED")).at(-1).metadata).toMatchObject({ from: "ACKNOWLEDGED", to: "IN_PROGRESS" });
    for (const u of [citizen, fan.user]) expect((await notificationsOf(prisma, u.id)).at(-1).type).toBe("IN_PROGRESS");
    expect((await start()).body.error.code).toBe("ALREADY_STARTED");
  });

  it("after a reassignment of an IN_PROGRESS issue, the new contractor starts their own assignment", async () => {
    await start();
    const other = await contractorSetup(prisma, app);
    await roads.agent.post(`/api/admin/issues/${issueId}/reassign`).send({ contractorId: other.contractor.id, deadlineAt: inDays(3), reason: "Crew change" });
    expect((await submitRepair(other.agent, issueId)).body.error.code).toBe("NOT_STARTED");
    const res = await start(other.agent);
    expect(res.body.job).toMatchObject({ status: "IN_PROGRESS", startedAt: expect.any(String) });
    expect((await submitRepair(other.agent, issueId)).status).toBe(201);
  });
});

describe("contractor can never set RESOLVED", () => {
  it("there is no route for it, admin routes are 403, and extra fields are refused", async () => {
    await start();
    expect((await worker.agent.post(`/api/contractor/issues/${issueId}/resolve`).send({})).status).toBe(404);
    expect((await worker.agent.patch(`/api/contractor/issues/${issueId}`).send({ status: "RESOLVED" })).status).toBe(404);
    expect((await worker.agent.post(`/api/admin/issues/${issueId}/accept`).send({})).status).toBe(403);
    expect((await submitRepair(worker.agent, issueId, { status: "RESOLVED" })).status).toBe(400); // unknown field
    expect((await submitRepair(worker.agent, issueId)).status).toBe(201);
    const s = await latestSubmission();
    expect((await worker.agent.post(`/api/admin/submissions/${s.id}/approve`).send({})).status).toBe(403);
    expect((await prisma.issue.findUnique({ where: { id: issueId } })).status).toBe("IN_PROGRESS");
  });
});

describe("repair evidence upload", () => {
  it("creates a SUBMITTED record with the photo; issue stays IN_PROGRESS; deadline clock pauses; AI check queued", async () => {
    expect((await submitRepair(worker.agent, issueId)).body.error.code).toBe("NOT_STARTED");
    await start();
    const capturedAt = "2026-10-18T09:15:00.000Z";
    const res = await submitRepair(worker.agent, issueId, { capturedAt, deviceLat: SANGLI.lat, deviceLng: SANGLI.lng, deviceAccuracyM: 8 });
    expect(res.status).toBe(201);
    expect(res.body.job.status).toBe("IN_PROGRESS");
    expect(res.body.job.deadline.paused).toBe(true);
    expect(res.body.job.submissions).toMatchObject([{ status: "SUBMITTED", note: "Patched and levelled", capturedAt, reviewReason: null }]);

    const s = await latestSubmission();
    expect(s.gpsDistanceM).toBeLessThan(1);
    const photo = await prisma.photo.findFirst({ where: { repairSubmissionId: s.id } });
    expect(photo).toMatchObject({ kind: "REPAIR_EVIDENCE", uploadedById: worker.contractor.id, issueId });
    expect(new Date(photo.capturedAt).toISOString()).toBe(capturedAt);
    expect(jobs.sent.at(-1)).toEqual({ name: "validate-repair", data: { submissionId: s.id } });
    expect((await audits("SUBMISSION_CREATED"))).toHaveLength(1);
    // The public copy has no EXIF/GPS
    const meta = await sharp(await storage.get(photo.publicKey)).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("poor connectivity: a retried upload (same request ID) doesn't create a second submission; capture time kept", async () => {
    await start();
    const clientRequestId = crypto.randomUUID();
    const first = await submitRepair(worker.agent, issueId, { clientRequestId, capturedAt: "2026-10-18T08:00:00.000Z" });
    const retry = await submitRepair(worker.agent, issueId, { clientRequestId, capturedAt: "2026-10-18T08:00:00.000Z" });
    expect([first.status, retry.status]).toEqual([201, 200]);
    expect(retry.body.duplicateRequest).toBe(true);
    expect(await prisma.repairSubmission.count()).toBe(1);
    expect(await prisma.photo.count({ where: { kind: "REPAIR_EVIDENCE" } })).toBe(1);
    expect((await latestSubmission()).capturedAt.toISOString()).toBe("2026-10-18T08:00:00.000Z");
  });

  it("one submission waiting at a time; photo required; bad files refused", async () => {
    await start();
    expect((await submitRepair(worker.agent, issueId, { photo: null })).body.error.code).toBe("PHOTO_REQUIRED");
    expect((await submitRepair(worker.agent, issueId, { photo: Buffer.from("not an image at all, just text") })).status).toBe(415);
    expect((await submitRepair(worker.agent, issueId)).status).toBe(201);
    expect((await submitRepair(worker.agent, issueId)).body.error.code).toBe("SUBMISSION_PENDING");
  });

  it("photo from a different location → SUSPICIOUS flag for the admin, not rejected", async () => {
    await start();
    const far = { deviceLat: SANGLI.lat + 0.01, deviceLng: SANGLI.lng, deviceAccuracyM: 10 }; // ~1.1 km
    const res = await submitRepair(worker.agent, issueId, far);
    expect(res.status).toBe(201);
    const flag = await prisma.issueFlag.findFirst({ where: { issueId, type: "SUSPICIOUS", clearedAt: null } });
    expect(flag.reason).toBe("Repair photo was taken far from the issue");
    expect((await latestSubmission()).status).toBe("SUBMITTED");
    const audit = (await audits("FLAG_ADDED")).at(-1);
    expect(audit.reason).toMatch(/m away, GPS accuracy 10 m/);
    // The admin sees the distance and can still approve.
    const view = (await roads.agent.get(`/api/issues/${issueId}`)).body.issue;
    expect(view.submissions[0].device.distanceFromIssueM).toBeGreaterThan(1000);
    expect((await approve(view.submissions[0].id)).status).toBe(200);
  });

  it("GPS rule edges: none and poor accuracy are never suspicious", () => {
    expect(classifyRepairGps({ distanceM: null, accuracyM: null })).toBe("NONE");
    expect(classifyRepairGps({ distanceM: 105, accuracyM: 10 }, 100)).toBe("OK");
    expect(classifyRepairGps({ distanceM: 111, accuracyM: 10 }, 100)).toBe("SUSPICIOUS");
    expect(classifyRepairGps({ distanceM: 2000, accuracyM: 500 }, 100)).toBe("MILD");
    expect(classifyRepairGps({ distanceM: 120, accuracyM: 500 }, 100)).toBe("OK");
  });
});

describe("AI repair check (suggestion only)", () => {
  it("compares the citizen's photo with the repair photo and stores the verdict", async () => {
    await start();
    await submitRepair(worker.agent, issueId);
    const s = await latestSubmission();
    const validate = fakeRepairValidator({ verdict: "UNCERTAIN", reason: "Different angle" });
    const result = await runRepairValidation(prisma, { submissionId: s.id }, { validateRepair: validate, storage });
    expect(result).toEqual({ outcome: "done", verdict: "UNCERTAIN" });
    expect(validate.calls).toHaveLength(1);
    expect(validate.calls[0].categoryKey).toBe("ROADS");
    expect(Buffer.isBuffer(validate.calls[0].before) && Buffer.isBuffer(validate.calls[0].after)).toBe(true);
    const original = await prisma.photo.findFirst({ where: { issueId, kind: "ISSUE_ORIGINAL" } });
    const evidence = await prisma.photo.findFirst({ where: { repairSubmissionId: s.id } });
    expect(validate.calls[0].before.equals(await storage.get(original.publicKey))).toBe(true); // citizen's photo first
    expect(validate.calls[0].after.equals(await storage.get(evidence.publicKey))).toBe(true);

    const view = (await roads.agent.get(`/api/issues/${issueId}`)).body.issue;
    expect(view.submissions[0].ai).toMatchObject({ verdict: "UNCERTAIN", reason: "Different angle", attempts: 1 });
    // The contractor doesn't see the AI result.
    expect((await worker.agent.get(`/api/contractor/issues/${issueId}`)).body.job.submissions[0].ai).toBeUndefined();
    // Not checked twice
    expect((await runRepairValidation(prisma, { submissionId: s.id }, { validateRepair: validate, storage })).outcome).toBe("skipped");
  });

  it("Gemini down → retried, then given up; the admin decides without it", async () => {
    await start();
    await submitRepair(worker.agent, issueId);
    const s = await latestSubmission();
    const down = async () => {
      throw new Error("Gemini timed out");
    };
    for (let i = 1; i < MAX_REPAIR_CHECK_ATTEMPTS; i++) {
      expect((await runRepairValidation(prisma, { submissionId: s.id }, { validateRepair: down, storage })).outcome).toBe("retry");
    }
    expect((await runRepairValidation(prisma, { submissionId: s.id }, { validateRepair: down, storage })).outcome).toBe("gave_up");
    expect((await latestSubmission()).aiVerdict).toBeNull();
    expect((await approve(s.id)).status).toBe(200);
  });

  it("the prompt uses the category's repair rules and not the contractor's note", () => {
    const p = buildRepairPrompt("STREETLIGHT");
    expect(p).toContain("same pole with a working lamp");
    expect(p).toContain("FIRST image");
    expect(p).toMatch(/UNCERTAIN/);
  });
});

describe("admin review of the repair", () => {
  it("approve → RESOLVED; assignment completed; verified photo published; reporter, supporters and contractor told", async () => {
    const fan = await anotherCitizen(prisma, app);
    await fan.agent.post(`/api/issues/${issueId}/support`).send({});
    await start();
    await submitRepair(worker.agent, issueId);
    const s = await latestSubmission();
    const repairPhoto = await prisma.photo.findFirst({ where: { repairSubmissionId: s.id } });

    // Before approval the citizen can't see the repair photo.
    expect((await agent.get(`/api/photos/${repairPhoto.id}`)).status).toBe(404);
    await runRepairValidation(prisma, { submissionId: s.id }, { validateRepair: fakeRepairValidator({ verdict: "INVALID", reason: "Hole visible" }), storage });

    // The admin decides: an INVALID AI verdict doesn't block approval.
    const res = await approve(s.id, { note: "Checked on site" });
    expect(res.status).toBe(200);
    expect(res.body.issue).toMatchObject({ status: "RESOLVED", assignment: null });
    expect(res.body.issue.submissions[0]).toMatchObject({ status: "APPROVED", review: { byId: roads.admin.id, reason: "Checked on site" } });
    expect(res.body.issue.pastAssignments[0]).toMatchObject({ endReason: "Repair approved", deadline: { paused: false } });

    const mine = (await agent.get(`/api/issues/${issueId}`)).body.issue;
    expect(mine.status).toBe("RESOLVED");
    expect(mine.resolution).toMatchObject({ resolvedAt: expect.any(String), photo: { id: repairPhoto.id } });
    expect(mine.photo.id).not.toBe(repairPhoto.id); // before + after
    expect((await agent.get(mine.resolution.photo.url)).status).toBe(200);
    expect((await agent.get(`${mine.resolution.photo.url}?variant=original`)).status).toBe(404);

    for (const u of [citizen, fan.user]) expect((await notificationsOf(prisma, u.id)).at(-1).type).toBe("RESOLVED");
    expect((await notificationsOf(prisma, worker.contractor.id)).at(-1)).toMatchObject({ type: "RESOLVED", params: { audience: "CONTRACTOR" } });
    expect((await audits("SUBMISSION_APPROVED"))[0].metadata).toMatchObject({ submissionId: s.id, aiVerdict: "INVALID" });
    expect((await audits("ISSUE_STATUS_CHANGED")).at(-1).metadata).toMatchObject({ from: "IN_PROGRESS", to: "RESOLVED" });

    // The job is gone from the contractor's list; reviewing again is refused.
    expect((await worker.agent.get("/api/contractor/issues")).body.items).toEqual([]);
    expect((await approve(s.id)).body.error.code).toBe("ALREADY_REVIEWED");
  });

  it("admin rejects evidence → stays IN_PROGRESS, reason sent, resubmission allowed, rework history kept", async () => {
    await start();
    await submitRepair(worker.agent, issueId);
    const first = await latestSubmission();
    expect((await reject(first.id, {})).status).toBe(400); // reason required

    const res = await reject(first.id, { reason: "Patch only covers half the hole" });
    expect(res.status).toBe(200);
    expect(res.body.issue.status).toBe("IN_PROGRESS");
    const n = (await notificationsOf(prisma, worker.contractor.id)).at(-1);
    expect(n).toMatchObject({ type: "REWORK_REQUESTED", params: { submissionId: first.id, reason: "Patch only covers half the hole" } });
    expect((await audits("SUBMISSION_REJECTED"))[0].reason).toBe("Patch only covers half the hole");

    const job = (await worker.agent.get(`/api/contractor/issues/${issueId}`)).body.job;
    expect(job.submissions).toMatchObject([{ status: "REJECTED", reviewReason: "Patch only covers half the hole" }]);
    expect(job.deadline.paused).toBe(false);

    expect((await submitRepair(worker.agent, issueId, { note: "Whole hole filled now" })).status).toBe(201);
    const second = await latestSubmission();
    expect((await approve(second.id)).body.issue.submissions.map((x) => x.status)).toEqual(["REJECTED", "APPROVED"]);
  });

  it("deadline clock: paused while awaiting review, resumes after rejection with the paused time added", async () => {
    await start();
    const a = await prisma.assignment.findFirst({ where: { issueId, endedAt: null } });
    await submitRepair(worker.agent, issueId);
    const paused = await prisma.assignment.findUnique({ where: { id: a.id } });
    expect(paused.pausedSince).not.toBeNull();
    // Pretend the review took 2 days.
    await prisma.assignment.update({ where: { id: a.id }, data: { pausedSince: new Date(Date.now() - 2 * 24 * 3600 * 1000) } });
    await reject((await latestSubmission()).id, { reason: "Redo the edges" });
    const resumed = await prisma.assignment.findUnique({ where: { id: a.id } });
    expect(resumed.pausedSince).toBeNull();
    expect(resumed.pausedSeconds).toBeGreaterThanOrEqual(2 * 24 * 3600 - 5);
    const job = (await worker.agent.get(`/api/contractor/issues/${issueId}`)).body.job;
    expect(new Date(job.deadline.effectiveDeadline) - new Date(job.deadline.deadlineAt)).toBeGreaterThanOrEqual((2 * 24 * 3600 - 5) * 1000);
  });

  it("another department's admin can't approve or reject (404); dashboard counts repairs to review", async () => {
    await start();
    await submitRepair(worker.agent, issueId);
    const s = await latestSubmission();
    expect((await roads.agent.get("/api/admin/dashboard")).body.repairsToReview).toBe(1);
    const electrical = await adminOf(prisma, app, "ELECTRICAL");
    expect((await electrical.agent.post(`/api/admin/submissions/${s.id}/approve`).send({})).status).toBe(404);
    expect((await electrical.agent.post(`/api/admin/submissions/${s.id}/reject`).send({ reason: "Not good" })).status).toBe(404);
    expect((await agent.post(`/api/admin/submissions/${s.id}/approve`).send({})).status).toBe(403);
    expect((await latestSubmission()).status).toBe("SUBMITTED");
  });

  it("the admin's review screen shows original and evidence side by side, with times and GPS", async () => {
    await start();
    await submitRepair(worker.agent, issueId, { capturedAt: "2026-10-18T07:30:00.000Z", deviceLat: SANGLI.lat, deviceLng: SANGLI.lng, deviceAccuracyM: 5 });
    const view = (await roads.agent.get(`/api/issues/${issueId}`)).body.issue;
    expect(view.photo.url).toBeTruthy();
    expect(view.submissions[0]).toMatchObject({
      status: "SUBMITTED",
      capturedAt: "2026-10-18T07:30:00.000Z",
      submittedAt: expect.any(String),
      device: { accuracyM: 5, distanceFromIssueM: 0 },
      photo: { url: expect.stringMatching(/^\/api\/photos\//), originalUrl: expect.stringMatching(/variant=original$/) },
      ai: { verdict: null },
      review: null,
    });
    expect((await roads.agent.get(view.submissions[0].photo.originalUrl)).status).toBe(200);
    expect(view.assignment.deadline.paused).toBe(true);
    expect(view.history.map((h) => h.action)).toEqual(expect.arrayContaining(["ASSIGNMENT_CREATED", "SUBMISSION_CREATED"]));
  });
});
