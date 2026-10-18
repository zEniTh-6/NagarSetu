// Seed: departments, categories (from categories.json) and one admin per department.
// Safe to run again: existing rows are kept and existing admins' passwords are NOT reset.
import crypto from "node:crypto";
import { hashPassword } from "../auth/password.js";
import { categoryRules } from "../rules/categories.js";
import { writeAudit, AuditAction, AuditTarget } from "../audit/audit.js";

// Named after the matching Sangli-Miraj-Kupwad Municipal Corporation (SMKC) departments.
// NagarSetu is a college prototype, not an official SMKC platform (see docs/brief.md).
export const DEPARTMENTS = [
  {
    code: "CONSTRUCTION",
    name: "Municipal Construction Department (Buildings and Roads)",
    adminName: "Construction Admin",
    adminEmail: "admin.construction@nagarsetu.local",
  },
  {
    code: "SOLID_WASTE",
    name: "Municipal Solid Waste Management Department",
    adminName: "Solid Waste Management Admin",
    adminEmail: "admin.swm@nagarsetu.local",
  },
  {
    code: "ELECTRICAL",
    name: "Municipal Electrical Department",
    adminName: "Electrical Admin",
    adminEmail: "admin.electrical@nagarsetu.local",
  },
];



/** 16 random characters from an unambiguous alphabet (no 0/O, 1/l/I). */
export function randomPassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * @returns {Promise<{ createdAdmins: {email:string, password:string, department:string}[] }>}
 */
export async function seed(prisma) {
  const departments = {};
  for (const d of DEPARTMENTS) {
    departments[d.code] = await prisma.department.upsert({
      where: { code: d.code },
      update: {},
      create: { code: d.code, name: d.name },
    });
  }

  for (const [key, rules] of Object.entries(categoryRules)) {
    const dept = departments[rules.department];
    if (!dept) throw new Error(`categories.json: ${key} points to unknown department ${rules.department}`);
    await prisma.category.upsert({
      where: { key },
      update: {},
      create: { key, name: rules.name, departmentId: dept.id },
    });
  }

  const createdAdmins = [];
  for (const d of DEPARTMENTS) {
    const exists = await prisma.user.findUnique({ where: { email: d.adminEmail } });
    if (exists) continue;

    const password = randomPassword();
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({
        data: {
          email: d.adminEmail,
          name: d.adminName,
          role: "ADMIN",
          departmentId: departments[d.code].id,
          passwordHash,
          mustChangePassword: true,
          emailVerified: true,
        },
      });
      await writeAudit(tx, {
        actor: null,
        action: AuditAction.USER_CREATED,
        targetType: AuditTarget.USER,
        targetId: admin.id,
        reason: "Seeded by the development team",
        metadata: { role: "ADMIN", department: d.code },
      });
    });
    createdAdmins.push({ email: d.adminEmail, password, department: d.code });
  }

  return { createdAdmins };
}
