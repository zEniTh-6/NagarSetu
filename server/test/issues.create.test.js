import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { makeUser, loginAgent } from "./helpers/auth.js";
import { citizenSetup, report, SANGLI } from "./helpers/issues.js";
import { png, tinyJpeg, fakeJpeg } from "./helpers/images.js";

let app, jobs, storage, citizen, agent;

beforeEach(async () => {
  await resetDb(prisma);
  jobs = createMemoryQueue();
  storage = tempStorage();
  app = makeTestApp({ jobs, storage });
  ({ citizen, agent } = await citizenSetup(prisma, app));
});
afterAll(() => prisma.$disconnect());

describe("creating a report", () => {
  it("valid report with no device GPS: saved as REPORTED, photo stored, check queued, audited, no flags", async () => {
    const res = await report(agent);
    expect(res.status).toBe(201);
    const { issue } = res.body;
    expect(issue).toMatchObject({
      status: "REPORTED",
      category: { key: "ROADS" },
      validation: { state: "CHECKING" },
      description: "Big pothole near the bus stand, road pe gaddha hai",
    });
    expect(issue.location.lat).toBeCloseTo(SANGLI.lat, 6);
    expect(issue.location.lng).toBeCloseTo(SANGLI.lng, 6);
    expect(issue.flags).toBeUndefined(); // citizens never see flags

    const row = await prisma.issue.findUnique({ where: { id: issue.id }, include: { category: { include: { department: true } } } });
    expect(row.category.department.code).toBe("CONSTRUCTION");
    expect(row.departmentId).toBe(row.category.departmentId);
    expect(row.gpsDistanceM).toBeNull();
    expect(await prisma.issueFlag.count()).toBe(0);

    const photo = await prisma.photo.findFirst({ where: { issueId: issue.id } });
    expect(await storage.exists(photo.originalKey)).toBe(true);
    expect(await storage.exists(photo.publicKey)).toBe(true);
    expect(jobs.sent).toEqual([{ name: "validate-photo", data: { issueId: issue.id, photoId: photo.id } }]);
    expect(await prisma.auditLog.count({ where: { action: "ISSUE_CREATED", targetId: issue.id, actorId: citizen.id } })).toBe(1);
  });

  it("strips EXIF/GPS from the public copy but keeps the original", async () => {
    const { body } = await report(agent);
    const photo = await prisma.photo.findFirst({ where: { issueId: body.issue.id } });
    expect((await sharp(await storage.get(photo.publicKey)).metadata()).exif).toBeUndefined();
    expect((await sharp(await storage.get(photo.originalKey)).metadata()).exif).toBeDefined();
  });

  it("stores the description exactly as written (Marathi, Hindi, mixed)", async () => {
    const text = "  रस्त्यावर मोठा खड्डा आहे — सड़क पर गड्ढा  ";
    const { body } = await report(agent, { description: text });
    expect((await prisma.issue.findUnique({ where: { id: body.issue.id } })).description).toBe(text);
  });

  it("accepts PNG and records the detected type", async () => {
    const res = await report(agent, { photo: await png() });
    expect(res.status).toBe(201);
    expect((await prisma.photo.findFirst()).mimeType).toBe("image/png");
  });
});

describe("idempotency (client request ID)", () => {
  it("a retry with the same clientRequestId returns the same issue and creates nothing new", async () => {
    const clientRequestId = crypto.randomUUID();
    const first = await report(agent, { clientRequestId });
    const retry = await report(agent, { clientRequestId });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.duplicateRequest).toBe(true);
    expect(retry.body.issue.id).toBe(first.body.issue.id);
    expect(await prisma.issue.count()).toBe(1);
    expect(await prisma.photo.count()).toBe(1);
    expect(jobs.sent).toHaveLength(1);
  });

  it("network loss mid-report: two identical requests at once still make exactly one issue", async () => {
    const clientRequestId = crypto.randomUUID();
    const results = await Promise.all([report(agent, { clientRequestId }), report(agent, { clientRequestId })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await prisma.issue.count()).toBe(1);
  });

  it("the same clientRequestId from another citizen is a different report", async () => {
    const clientRequestId = crypto.randomUUID();
    expect((await report(agent, { clientRequestId })).status).toBe(201);
    const other = await makeUser(prisma, { emailVerified: true });
    const otherAgent = await loginAgent(app, other.email);
    expect((await report(otherAgent, { clientRequestId })).status).toBe(201);
    expect(await prisma.issue.count()).toBe(2);
  });
});

describe("who can report", () => {
  it("unverified citizens cannot report", async () => {
    const u = await makeUser(prisma, { emailVerified: false });
    const res = await report(await loginAgent(app, u.email));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("admins and contractors cannot report; anonymous gets 401", async () => {
    const dept = await prisma.department.findFirst();
    const admin = await makeUser(prisma, { role: "ADMIN", departmentId: dept.id });
    const contractor = await makeUser(prisma, { role: "CONTRACTOR" });
    expect((await report(await loginAgent(app, admin.email))).status).toBe(403);
    expect((await report(await loginAgent(app, contractor.email))).status).toBe(403);
    expect((await report(request.agent(app))).status).toBe(401);
    expect(await prisma.issue.count()).toBe(0);
  });
});

describe("immediate checks", () => {
  it.each([
    ["no photo", { photo: null }, 400, "PHOTO_REQUIRED"],
    ["a text file named .jpg", { photo: fakeJpeg() }, 415, "UNSUPPORTED_IMAGE"],
    ["outside SMKC", { lat: 18.5204, lng: 73.8567 }, 422, "OUTSIDE_SERVICE_AREA"],
    ["unknown category", { categoryKey: "POTHOLES" }, 400, "UNKNOWN_CATEGORY"],
    ["blank description", { description: "    " }, 400, "VALIDATION_FAILED"],
    ["device lat without lng", { deviceLat: 16.85 }, 400, "VALIDATION_FAILED"],
    ["a role field", { role: "ADMIN" }, 400, "VALIDATION_FAILED"],
    ["a bad clientRequestId", { clientRequestId: "abc" }, 400, "VALIDATION_FAILED"],
  ])("rejects %s", async (_name, fields, status, code) => {
    const res = await report(agent, fields);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(await prisma.issue.count()).toBe(0);
  });

  it("rejects a tiny image", async () => {
    const res = await report(agent, { photo: await tinyJpeg() });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("IMAGE_TOO_SMALL");
  });

  it("rejects a photo over the size limit", async () => {
    const res = await report(agent, { photo: Buffer.alloc(11 * 1024 * 1024, 1) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PHOTO_TOO_LARGE");
  });
});

describe("GPS comparison (never blocks the report)", () => {
  const near = { deviceLat: SANGLI.lat + 0.0001, deviceLng: SANGLI.lng }; // ~11 m
  const far = { deviceLat: SANGLI.lat + 0.0075, deviceLng: SANGLI.lng }; // ~830 m

  it("matching GPS: distance recorded, no flag", async () => {
    const { body } = await report(agent, { ...near, deviceAccuracyM: 10 });
    const row = await prisma.issue.findUnique({ where: { id: body.issue.id } });
    expect(row.gpsDistanceM).toBeGreaterThan(5);
    expect(row.gpsDistanceM).toBeLessThan(20);
    expect(await prisma.issueFlag.count()).toBe(0);
  });

  it("large mismatch with good accuracy: SUSPICIOUS flag (still accepted, audited)", async () => {
    const res = await report(agent, { ...far, deviceAccuracyM: 10 });
    expect(res.status).toBe(201);
    const flags = await prisma.issueFlag.findMany();
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("SUSPICIOUS");
    const audit = await prisma.auditLog.findFirst({ where: { action: "FLAG_ADDED" } });
    expect(audit.reason).toMatch(/m apart, GPS accuracy 10 m/);
  });

  it("large mismatch with poor accuracy: only a mild signal (distance recorded, no flag)", async () => {
    const { body } = await report(agent, { ...far, deviceAccuracyM: 250 });
    expect(await prisma.issueFlag.count()).toBe(0);
    expect((await prisma.issue.findUnique({ where: { id: body.issue.id } })).gpsDistanceM).toBeGreaterThan(700);
  });

  it("location permission denied (no device GPS): accepted, not penalised", async () => {
    const res = await report(agent, {});
    expect(res.status).toBe(201);
    expect(await prisma.issueFlag.count()).toBe(0);
  });
});
