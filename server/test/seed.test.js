import { describe, it, expect, beforeEach, afterAll } from "vitest";
import bcrypt from "bcrypt";
import { prisma } from "../src/db/prisma.js";
import { seed, randomPassword } from "../src/seed/seed.js";
import { resetDb } from "./helpers/db.js";

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

describe("seed", () => {
  it("creates 3 departments, 3 categories and 1 admin per department", async () => {
    const { createdAdmins } = await seed(prisma);

    expect(await prisma.department.count()).toBe(3);
    expect(await prisma.category.count()).toBe(3);

    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, include: { department: true } });
    expect(admins).toHaveLength(3);
    expect(new Set(admins.map((a) => a.department.code))).toEqual(new Set(["CONSTRUCTION", "SOLID_WASTE", "ELECTRICAL"]));
    for (const a of admins) {
      expect(a.mustChangePassword).toBe(true);
      expect(a.status).toBe("ACTIVE");
      expect(a.createdById).toBeNull();
    }

    // The printed password matches the stored bcrypt hash; the plain text is never stored.
    expect(createdAdmins).toHaveLength(3);
    for (const { email, password } of createdAdmins) {
      const user = admins.find((a) => a.email === email);
      expect(user.passwordHash).not.toContain(password);
      expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    }
  });

  it("uses the SMKC department names", async () => {
    await seed(prisma);
    const depts = await prisma.department.findMany();
    const names = Object.fromEntries(depts.map((d) => [d.code, d.name]));
    expect(names).toEqual({
      CONSTRUCTION: "Municipal Construction Department (Buildings and Roads)",
      SOLID_WASTE: "Municipal Solid Waste Management Department",
      ELECTRICAL: "Municipal Electrical Department",
    });
  });

  it("maps categories to the right departments", async () => {
    await seed(prisma);
    const cats = await prisma.category.findMany({ include: { department: true } });
    const map = Object.fromEntries(cats.map((c) => [c.key, c.department.code]));
    expect(map).toEqual({ ROADS: "CONSTRUCTION", GARBAGE: "SOLID_WASTE", STREETLIGHT: "ELECTRICAL" });
  });

  it("writes an audit row for each admin account it creates", async () => {
    await seed(prisma);
    const rows = await prisma.auditLog.findMany({ where: { action: "USER_CREATED" } });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.actorId).toBeNull();
      expect(r.targetType).toBe("USER");
      expect(r.reason).toMatch(/seed/i);
    }
  });

  it("is safe to run twice and does not reset passwords", async () => {
    await seed(prisma);
    const before = await prisma.user.findMany({ orderBy: { email: "asc" } });

    const { createdAdmins } = await seed(prisma);
    expect(createdAdmins).toEqual([]);

    const after = await prisma.user.findMany({ orderBy: { email: "asc" } });
    expect(after.map((u) => u.passwordHash)).toEqual(before.map((u) => u.passwordHash));
    expect(await prisma.department.count()).toBe(3);
    expect(await prisma.category.count()).toBe(3);
    expect(await prisma.auditLog.count()).toBe(3);
  });

  it("generates strong, varied initial passwords", () => {
    const a = randomPassword();
    const b = randomPassword();
    expect(a).toHaveLength(16);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z2-9]+$/);
  });
});
