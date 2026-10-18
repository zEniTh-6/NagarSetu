import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { writeAudit, AuditAction, AuditTarget } from "../src/audit/audit.js";
import { resetDb } from "./helpers/db.js";
import { createUser } from "./helpers/factories.js";

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

describe("writeAudit", () => {
  it("records who, when, action, target, reason and metadata", async () => {
    const admin = await createUser(prisma, { role: "CITIZEN" });
    const before = new Date(Date.now() - 1000);
    const row = await writeAudit(prisma, {
      actor: { id: admin.id, role: "CITIZEN" },
      action: AuditAction.ISSUE_STATUS_CHANGED,
      targetType: AuditTarget.ISSUE,
      targetId: "issue-123",
      reason: "Photo shows the pothole clearly",
      metadata: { from: "REPORTED", to: "ACKNOWLEDGED" },
    });
    expect(row).toMatchObject({
      actorId: admin.id,
      actorRole: "CITIZEN",
      action: "ISSUE_STATUS_CHANGED",
      targetType: "ISSUE",
      targetId: "issue-123",
      reason: "Photo shows the pothole clearly",
      metadata: { from: "REPORTED", to: "ACKNOWLEDGED" },
    });
    expect(row.createdAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("allows a system actor (null)", async () => {
    const row = await writeAudit(prisma, {
      actor: null,
      action: AuditAction.FLAG_ADDED,
      targetType: AuditTarget.ISSUE,
      targetId: "issue-1",
    });
    expect(row.actorId).toBeNull();
    expect(row.actorRole).toBeNull();
    expect(row.reason).toBeNull();
  });

  it("rejects unknown actions and targets", async () => {
    await expect(
      writeAudit(prisma, { actor: null, action: "DELETE_EVERYTHING", targetType: "ISSUE", targetId: "x" }),
    ).rejects.toThrow();
    await expect(
      writeAudit(prisma, { actor: null, action: AuditAction.FLAG_ADDED, targetType: "PLANET", targetId: "x" }),
    ).rejects.toThrow();
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("rejects an empty reason and a missing target id", async () => {
    await expect(
      writeAudit(prisma, { actor: null, action: AuditAction.FLAG_ADDED, targetType: "ISSUE", targetId: "x", reason: "  " }),
    ).rejects.toThrow();
    await expect(
      writeAudit(prisma, { actor: null, action: AuditAction.FLAG_ADDED, targetType: "ISSUE", targetId: "" }),
    ).rejects.toThrow();
  });

  it("is saved together with the change, or rolled back with it", async () => {
    const user = await createUser(prisma);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { status: "DEACTIVATED" } });
        await writeAudit(tx, {
          actor: null,
          action: AuditAction.USER_DEACTIVATED,
          targetType: AuditTarget.USER,
          targetId: user.id,
          reason: "test",
        });
        throw new Error("something later failed");
      }),
    ).rejects.toThrow("something later failed");

    expect((await prisma.user.findUnique({ where: { id: user.id } })).status).toBe("ACTIVE");
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
