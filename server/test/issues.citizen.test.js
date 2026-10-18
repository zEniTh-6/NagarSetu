import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { runPhotoValidation } from "../src/modules/issues/validation.service.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { makeUser, loginAgent } from "./helpers/auth.js";
import { citizenSetup, report, adminOf, fakeValidator } from "./helpers/issues.js";
import { cameraJpeg } from "./helpers/images.js";

let app, jobs, storage, citizen, agent;

beforeEach(async () => {
  await resetDb(prisma);
  jobs = createMemoryQueue();
  storage = tempStorage();
  app = makeTestApp({ jobs, storage });
  ({ citizen, agent } = await citizenSetup(prisma, app));
});
afterAll(() => prisma.$disconnect());

const newIssue = async (fields) => (await report(agent, fields)).body.issue;
const otherCitizen = async () => loginAgent(app, (await makeUser(prisma, { emailVerified: true })).email);

describe("retake after INVALID", () => {
  it("replaces the photo, keeps the old one, resets the check and queues it again", async () => {
    const issue = await newIssue();
    await runPhotoValidation(prisma, jobs.sent.find((j) => j.name === "validate-photo").data, { validatePhoto: fakeValidator({ verdict: "INVALID", reason: "Screenshot" }), storage });

    const res = await agent.post(`/api/issues/${issue.id}/photo`).attach("photo", await cameraJpeg(), "retake.jpg");
    expect(res.status).toBe(200);
    expect(res.body.issue.validation).toEqual({ state: "CHECKING" });

    const photos = await prisma.photo.findMany({ where: { issueId: issue.id }, orderBy: { createdAt: "asc" } });
    expect(photos).toHaveLength(2);
    expect(photos[0].replacedAt).not.toBeNull();
    expect(photos[1].replacedAt).toBeNull();
    expect(res.body.issue.photo.id).toBe(photos[1].id);
    expect(jobs.sent.findLast((j) => j.name === "validate-photo").data).toEqual({ issueId: issue.id, photoId: photos[1].id });
    expect(await prisma.auditLog.count({ where: { action: "ISSUE_PHOTO_REPLACED" } })).toBe(1);
  });

  it("is refused when no retake was requested, and hidden from other citizens", async () => {
    const issue = await newIssue();
    const notAsked = await agent.post(`/api/issues/${issue.id}/photo`).attach("photo", await cameraJpeg(), "x.jpg");
    expect(notAsked.status).toBe(409);
    const other = await (await otherCitizen()).post(`/api/issues/${issue.id}/photo`).attach("photo", await cameraJpeg(), "x.jpg");
    expect(other.status).toBe(404);
  });
});

describe("withdraw", () => {
  it("the reporter can withdraw before acknowledgement (audited), only once", async () => {
    const issue = await newIssue();
    const res = await agent.post(`/api/issues/${issue.id}/withdraw`).send({ reason: "Fixed by neighbours" });
    expect(res.status).toBe(200);
    expect(res.body.issue.status).toBe("WITHDRAWN");
    const audit = await prisma.auditLog.findFirst({ where: { action: "ISSUE_STATUS_CHANGED", targetId: issue.id } });
    expect(audit).toMatchObject({ actorId: citizen.id, metadata: { from: "REPORTED", to: "WITHDRAWN" } });
    expect((await agent.post(`/api/issues/${issue.id}/withdraw`).send({})).status).toBe(409);
  });

  it("not after the admin acknowledged it; not by someone else", async () => {
    const issue = await newIssue();
    expect((await (await otherCitizen()).post(`/api/issues/${issue.id}/withdraw`).send({})).status).toBe(404);
    await prisma.issue.update({ where: { id: issue.id }, data: { status: "ACKNOWLEDGED" } });
    expect((await agent.post(`/api/issues/${issue.id}/withdraw`).send({})).status).toBe(409);
  });
});

describe("my complaints", () => {
  it("lists only my own reports, newest first, with paging", async () => {
    const a = await newIssue({ description: "first report here" });
    const b = await newIssue({ description: "second report here" });
    const otherAgent = await otherCitizen();
    expect((await report(otherAgent)).status).toBe(201);

    const res = await agent.get("/api/issues/mine?pageSize=1");
    expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(res.body.items.map((i) => i.id)).toEqual([b.id]);
    expect((await agent.get("/api/issues/mine?page=2&pageSize=1")).body.items.map((i) => i.id)).toEqual([a.id]);
    expect(res.body.items[0].validation).toEqual({ state: "CHECKING" });
  });
});

describe("reading one issue", () => {
  it("reporter gets the citizen view; another citizen and a contractor get 404", async () => {
    const issue = await newIssue({ deviceLat: 16.86, deviceLng: 74.5815, deviceAccuracyM: 10 }); // SUSPICIOUS
    const mine = await agent.get(`/api/issues/${issue.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.issue.flags).toBeUndefined();
    expect(mine.body.issue.device).toBeUndefined();

    expect((await (await otherCitizen()).get(`/api/issues/${issue.id}`)).status).toBe(404);
    const contractor = await makeUser(prisma, { role: "CONTRACTOR" });
    expect((await (await loginAgent(app, contractor.email)).get(`/api/issues/${issue.id}`)).status).toBe(404);
  });

  it("the department's admin gets the admin view with flags and AI details; other departments get 404", async () => {
    const issue = await newIssue({ deviceLat: 16.86, deviceLng: 74.5815, deviceAccuracyM: 10 });
    const { agent: roadsAdmin } = await adminOf(prisma, app, "CONSTRUCTION");
    const res = await roadsAdmin.get(`/api/issues/${issue.id}`);
    expect(res.status).toBe(200);
    expect(res.body.issue.flags.map((f) => f.type)).toEqual(["SUSPICIOUS"]);
    expect(res.body.issue.ai).toMatchObject({ verdict: null, attempts: 0 });
    expect(res.body.issue.device.distanceFromPinM).toBeGreaterThan(800);

    const { agent: swmAdmin } = await adminOf(prisma, app, "SOLID_WASTE");
    expect((await swmAdmin.get(`/api/issues/${issue.id}`)).status).toBe(404);
  });
});

describe("photo access", () => {
  it("reporter sees the public copy (no EXIF) but not the original; admin sees both; others 404/401", async () => {
    const issue = await newIssue();
    const url = issue.photo.url;

    const pub = await agent.get(url).buffer(true);
    expect(pub.status).toBe(200);
    expect(pub.headers["content-type"]).toBe("image/jpeg");
    expect((await sharp(pub.body).metadata()).exif).toBeUndefined();
    expect((await agent.get(`${url}?variant=original`)).status).toBe(404);

    const { agent: roadsAdmin } = await adminOf(prisma, app, "CONSTRUCTION");
    const orig = await roadsAdmin.get(`${url}?variant=original`).buffer(true);
    expect(orig.status).toBe(200);
    expect((await sharp(orig.body).metadata()).exif).toBeDefined();

    expect((await (await otherCitizen()).get(url)).status).toBe(404);
    const { agent: elecAdmin } = await adminOf(prisma, app, "ELECTRICAL");
    expect((await elecAdmin.get(url)).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
  });
});

describe("categories", () => {
  it("lists the three categories with their departments (no login needed)", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.body.categories.map((c) => [c.key, c.department.code]).sort()).toEqual([
      ["GARBAGE", "SOLID_WASTE"],
      ["ROADS", "CONSTRUCTION"],
      ["STREETLIGHT", "ELECTRICAL"],
    ]);
  });
});
