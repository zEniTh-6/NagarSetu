import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Router } from "express";
import { z } from "zod";
import { makeTestApp as createApp } from "./helpers/app.js";
import { prisma } from "../src/db/prisma.js";
import { requireAuth, requireRole } from "../src/auth/middleware.js";
import { departmentScope, assertInDepartment } from "../src/auth/scope.js";
import { validate } from "../src/middleware/validate.js";
import { resetDb } from "./helpers/db.js";
import { makeUser, makeDepartment, loginAgent } from "./helpers/auth.js";
import { createCategory, insertIssue } from "./helpers/factories.js";

// Stand-ins for later admin issue routes, built the way services will use the helpers.
const app = createApp({
  extraRoutes: ({ prisma }) => {
    const r = Router();
    const admin = [requireAuth(prisma), requireRole("ADMIN")];
    r.get("/api/test/issues", ...admin, async (req, res) => {
      const issues = await prisma.issue.findMany({ where: { ...departmentScope(req.user) }, select: { id: true } });
      res.json({ ids: issues.map((i) => i.id) });
    });
    r.get("/api/test/issues/:id", ...admin, validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res) => {
      const issue = await prisma.issue.findUnique({ where: { id: req.validated.params.id }, select: { id: true, departmentId: true } });
      res.json({ issue: assertInDepartment(req.user, issue) });
    });
    return r;
  },
});

let roads, sanitation, roadsIssue, garbageIssue, sanitationAdmin;

beforeEach(async () => {
  await resetDb(prisma);
  roads = await makeDepartment(prisma);
  sanitation = await makeDepartment(prisma);
  const roadsCat = await createCategory(prisma, roads.id);
  const garbageCat = await createCategory(prisma, sanitation.id);
  const citizen = await makeUser(prisma);
  roadsIssue = await insertIssue(prisma, { reporterId: citizen.id, categoryId: roadsCat.id, departmentId: roads.id, lat: 16.85, lng: 74.58 });
  garbageIssue = await insertIssue(prisma, { reporterId: citizen.id, categoryId: garbageCat.id, departmentId: sanitation.id, lat: 16.85, lng: 74.58 });
  sanitationAdmin = await makeUser(prisma, { role: "ADMIN", departmentId: sanitation.id });
});
afterAll(() => prisma.$disconnect());

describe("department scope", () => {
  it("an admin's list only contains their department's issues", async () => {
    const agent = await loginAgent(app, sanitationAdmin.email);
    expect((await agent.get("/api/test/issues")).body.ids).toEqual([garbageIssue]);
  });

  it("a sanitation admin opening a roads issue by URL gets 404, same as a missing issue", async () => {
    const agent = await loginAgent(app, sanitationAdmin.email);
    const other = await agent.get(`/api/test/issues/${roadsIssue}`);
    const missing = await agent.get(`/api/test/issues/${crypto.randomUUID()}`);
    expect(other.status).toBe(404);
    expect(other.body).toEqual(missing.body);
    expect((await agent.get(`/api/test/issues/${garbageIssue}`)).status).toBe(200);
  });

  it("departmentScope refuses non-admins instead of returning an empty filter", () => {
    expect(() => departmentScope({ role: "CITIZEN", departmentId: null })).toThrow();
    expect(() => departmentScope({ role: "CONTRACTOR", departmentId: null })).toThrow();
    expect(() => departmentScope(undefined)).toThrow();
    expect(departmentScope({ role: "ADMIN", departmentId: "d1" })).toEqual({ departmentId: "d1" });
  });
});
