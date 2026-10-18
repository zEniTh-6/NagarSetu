import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { issueIdsWithinRadius } from "../src/geo/point.js";
import { resetDb } from "./helpers/db.js";
import { createDepartment, createCategory, createUser, insertIssue } from "./helpers/factories.js";

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

async function baseData() {
  const dept = await createDepartment(prisma);
  const cat = await createCategory(prisma, dept.id);
  const citizen = await createUser(prisma);
  return { dept, cat, citizen };
}

describe("database extensions and indexes", () => {
  it("has postgis and vector enabled", async () => {
    const rows = await prisma.$queryRaw`SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'vector')`;
    expect(rows.map((r) => r.extname).sort()).toEqual(["postgis", "vector"]);
  });

  it("has a GiST index on issues.location", async () => {
    const rows = await prisma.$queryRaw`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'issues' AND indexname = 'issues_location_idx'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/USING gist \(location\)/i);
  });
});

describe("issue location (PostGIS)", () => {
  it("stores a point and finds it by distance", async () => {
    const { dept, cat, citizen } = await baseData();
    // Sangli: two points ~11 m apart, and one ~1.1 km away
    const near = await insertIssue(prisma, { reporterId: citizen.id, categoryId: cat.id, departmentId: dept.id, lat: 16.8524, lng: 74.5815 });
    const near2 = await insertIssue(prisma, { reporterId: citizen.id, categoryId: cat.id, departmentId: dept.id, lat: 16.8525, lng: 74.5815 });
    await insertIssue(prisma, { reporterId: citizen.id, categoryId: cat.id, departmentId: dept.id, lat: 16.8624, lng: 74.5815 });

    const within15 = await issueIdsWithinRadius(prisma, { lat: 16.8524, lng: 74.5815, radiusM: 15 });
    expect(within15).toEqual([near, near2]);
  });

  it("rejects out-of-range coordinates before reaching SQL", async () => {
    await expect(issueIdsWithinRadius(prisma, { lat: 91, lng: 0, radiusM: 10 })).rejects.toThrow();
    await expect(issueIdsWithinRadius(prisma, { lat: 0, lng: 0, radiusM: -1 })).rejects.toThrow();
  });

  it("treats injection-looking text as plain data", async () => {
    const { dept, cat, citizen } = await baseData();
    const evil = "x'); DROP TABLE issues; --";
    const id = await insertIssue(prisma, { reporterId: citizen.id, categoryId: cat.id, departmentId: dept.id, lat: 16.85, lng: 74.58, description: evil });
    const issue = await prisma.issue.findUnique({ where: { id } });
    expect(issue.description).toBe(evil);
  });

  it("keeps the description exactly as written (any script)", async () => {
    const { dept, cat, citizen } = await baseData();
    const text = "रस्त्यावर मोठा खड्डा आहे";
    const id = await insertIssue(prisma, { reporterId: citizen.id, categoryId: cat.id, departmentId: dept.id, lat: 16.85, lng: 74.58, description: text });
    expect((await prisma.issue.findUnique({ where: { id } })).description).toBe(text);
  });
});

describe("constraints", () => {
  it("rejects the same clientRequestId twice from one reporter, allows it for another", async () => {
    const { dept, cat, citizen } = await baseData();
    const other = await createUser(prisma);
    const args = { categoryId: cat.id, departmentId: dept.id, lat: 16.85, lng: 74.58, clientRequestId: "req-1" };
    await insertIssue(prisma, { ...args, reporterId: citizen.id });
    await expect(insertIssue(prisma, { ...args, reporterId: citizen.id })).rejects.toThrow(/unique|duplicate/i);
    await expect(insertIssue(prisma, { ...args, reporterId: other.id })).resolves.toBeTypeOf("string");
  });

  it("requires a department for admins and forbids one for others", async () => {
    const dept = await createDepartment(prisma);
    await expect(createUser(prisma, { role: "ADMIN" })).rejects.toThrow();
    await expect(createUser(prisma, { role: "CITIZEN", departmentId: dept.id })).rejects.toThrow();
    await expect(createUser(prisma, { role: "CONTRACTOR", departmentId: dept.id })).rejects.toThrow();
    await expect(createUser(prisma, { role: "ADMIN", departmentId: dept.id })).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("allows only one active assignment per issue", async () => {
    const { dept, cat, citizen } = await baseData();
    const admin = await createUser(prisma, { role: "ADMIN", departmentId: dept.id });
    const contractor = await createUser(prisma, { role: "CONTRACTOR" });
    const issueId = await insertIssue(prisma, { reporterId: citizen.id, categoryId: cat.id, departmentId: dept.id, lat: 16.85, lng: 74.58 });
    const data = { issueId, contractorId: contractor.id, assignedById: admin.id, departmentId: dept.id, deadlineAt: new Date(Date.now() + 86400000) };

    const first = await prisma.assignment.create({ data });
    await expect(prisma.assignment.create({ data })).rejects.toThrow();

    // After ending the first, a new active one is allowed (reassignment).
    await prisma.assignment.update({ where: { id: first.id }, data: { endedAt: new Date(), endReason: "contractor deactivated" } });
    await expect(prisma.assignment.create({ data })).resolves.toBeDefined();
  });

  it("allows one upvote per account per issue", async () => {
    const { dept, cat, citizen } = await baseData();
    const issueId = await insertIssue(prisma, { reporterId: citizen.id, categoryId: cat.id, departmentId: dept.id, lat: 16.85, lng: 74.58 });
    const voter = await createUser(prisma);
    await prisma.upvote.create({ data: { issueId, userId: voter.id } });
    await expect(prisma.upvote.create({ data: { issueId, userId: voter.id } })).rejects.toThrow();
  });

  it("defaults: new issue is REPORTED with no AI result yet", async () => {
    const { dept, cat, citizen } = await baseData();
    const id = await insertIssue(prisma, { reporterId: citizen.id, categoryId: cat.id, departmentId: dept.id, lat: 16.85, lng: 74.58 });
    const issue = await prisma.issue.findUnique({ where: { id } });
    expect(issue).toMatchObject({ status: "REPORTED", aiVerdict: null, priority: null, aiAttempts: 0 });
  });
});
