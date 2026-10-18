// Contractor accounts: created by an admin, activated through a one-time invite link.
// Contractors are not tied to a department; any admin may create or deactivate one (decision D-005).
import { AppError } from "../../lib/AppError.js";
import { HOUR, addMs } from "../../lib/time.js";
import { phoneKey } from "../../lib/schemas.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { hashPassword } from "../../auth/password.js";
import { randomToken, sha256, signSession } from "../../auth/tokens.js";
import { env } from "../../config/env.js";

export const INVITE_TTL_MS = 72 * HOUR;

const admin = (u) => ({ id: u.id, role: u.role });
const normName = (s) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const inviteUrl = (token) => `${env.WEB_ORIGIN}/invite/${token}`;

export function publicContractor(c) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    workType: c.workType,
    licenceNumber: c.licenceNumber,
    status: c.status,
    invitePending: !c.passwordHash,
    createdAt: c.createdAt,
  };
}

/**
 * Existing contractors that look like the same person/company: same phone (last 10 digits),
 * same licence number, or one name contained in the other. A warning only — the admin decides.
 * Prototype scale: compares in memory against all contractor accounts.
 */
export async function findSimilar(prisma, { name, phone, licenceNumber }) {
  const contractors = await prisma.user.findMany({ where: { role: "CONTRACTOR" }, orderBy: { createdAt: "asc" } });
  const n = normName(name);
  const p = phoneKey(phone);
  const lic = normName(licenceNumber);

  return contractors
    .map((c) => {
      const reasons = [];
      if (p && phoneKey(c.phone) === p) reasons.push("PHONE");
      if (lic && normName(c.licenceNumber) === lic) reasons.push("LICENCE");
      const cn = normName(c.name);
      if (n.length >= 3 && cn.length >= 3 && (cn.includes(n) || n.includes(cn))) reasons.push("NAME");
      return reasons.length ? { ...publicContractor(c), matchedOn: reasons } : null;
    })
    .filter(Boolean);
}

export async function createContractor(prisma, actor, input, now = new Date()) {
  const { confirmSimilar = false, ...details } = input;
  if (await prisma.user.findUnique({ where: { email: details.email }, select: { id: true } })) {
    throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }
  const similar = await findSimilar(prisma, details);
  if (similar.length && !confirmSimilar) {
    throw new AppError(409, "SIMILAR_CONTRACTORS", "Similar contractors already exist", { similar });
  }

  const token = randomToken();
  try {
    const { contractor, invite } = await prisma.$transaction(async (tx) => {
      const contractor = await tx.user.create({
        data: {
          role: "CONTRACTOR",
          name: details.name,
          email: details.email,
          phone: details.phone,
          workType: details.workType ?? null,
          licenceNumber: details.licenceNumber ?? null,
          createdById: actor.id,
          passwordHash: null, // set by the contractor through the invite link
        },
      });
      const invite = await tx.inviteToken.create({
        data: {
          userId: contractor.id,
          createdById: actor.id,
          tokenHash: sha256(token),
          expiresAt: addMs(now, INVITE_TTL_MS),
          createdAt: now,
        },
      });
      await writeAudit(tx, {
        actor: admin(actor),
        action: AuditAction.USER_CREATED,
        targetType: AuditTarget.USER,
        targetId: contractor.id,
        reason: similar.length ? "Created despite similar-contractor warning" : "Contractor created by admin",
        metadata: {
          role: "CONTRACTOR",
          createdByDepartmentId: actor.departmentId,
          ...(similar.length ? { similarContractorIds: similar.map((s) => s.id) } : {}),
        },
      });
      await writeAudit(tx, {
        actor: admin(actor),
        action: AuditAction.INVITE_CREATED,
        targetType: AuditTarget.INVITE,
        targetId: invite.id,
        metadata: { contractorId: contractor.id, expiresAt: invite.expiresAt.toISOString() },
      });
      return { contractor, invite };
    });
    return { contractor, inviteUrl: inviteUrl(token), inviteExpiresAt: invite.expiresAt };
  } catch (err) {
    if (err?.code === "P2002") throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    throw err;
  }
}

async function getContractor(prisma, id) {
  const c = await prisma.user.findUnique({ where: { id } });
  if (!c || c.role !== "CONTRACTOR") throw new AppError(404, "NOT_FOUND", "Not found");
  return c;
}

/** New invite link for a contractor who hasn't set a password yet. Older links stop working. */
export async function reissueInvite(prisma, actor, contractorId, now = new Date()) {
  const c = await getContractor(prisma, contractorId);
  if (c.passwordHash) throw new AppError(409, "INVITE_ALREADY_ACCEPTED", "This contractor has already set a password");
  if (c.status === "DEACTIVATED") throw new AppError(409, "ACCOUNT_DEACTIVATED", "This contractor is deactivated");

  const token = randomToken();
  const invite = await prisma.$transaction(async (tx) => {
    await tx.inviteToken.updateMany({ where: { userId: c.id, usedAt: null }, data: { expiresAt: now } });
    const invite = await tx.inviteToken.create({
      data: { userId: c.id, createdById: actor.id, tokenHash: sha256(token), expiresAt: addMs(now, INVITE_TTL_MS), createdAt: now },
    });
    await writeAudit(tx, {
      actor: admin(actor),
      action: AuditAction.INVITE_CREATED,
      targetType: AuditTarget.INVITE,
      targetId: invite.id,
      reason: "Invite re-issued; older links revoked",
      metadata: { contractorId: c.id, expiresAt: invite.expiresAt.toISOString() },
    });
    return invite;
  });
  return { inviteUrl: inviteUrl(token), inviteExpiresAt: invite.expiresAt };
}

/** Deactivate, never delete. (Reassigning their active jobs arrives with assignments.) */
export async function deactivateContractor(prisma, actor, contractorId, reason, now = new Date()) {
  const c = await getContractor(prisma, contractorId);
  if (c.status === "DEACTIVATED") throw new AppError(409, "ALREADY_DEACTIVATED", "Already deactivated");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: c.id },
      data: { status: "DEACTIVATED", deactivatedAt: now },
    });
    await tx.inviteToken.updateMany({ where: { userId: c.id, usedAt: null }, data: { expiresAt: now } });
    await writeAudit(tx, {
      actor: admin(actor),
      action: AuditAction.USER_DEACTIVATED,
      targetType: AuditTarget.USER,
      targetId: c.id,
      reason,
      metadata: { role: "CONTRACTOR", byDepartmentId: actor.departmentId },
    });
    return updated;
  });
}

// ---------- Invite link (public) ----------

async function loadInvite(prisma, token, now) {
  const invite = await prisma.inviteToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!invite) throw new AppError(404, "INVITE_NOT_FOUND", "This invite link is not valid");
  if (invite.usedAt) throw new AppError(410, "INVITE_USED", "This invite link has already been used");
  if (invite.expiresAt <= now || invite.user.status === "DEACTIVATED") {
    throw new AppError(410, "INVITE_EXPIRED", "This invite link has expired. Ask your admin for a new one");
  }
  return invite;
}

/** Checking a link does NOT use it up (chat apps open links to build previews). */
export async function getInvite(prisma, token, now = new Date()) {
  const invite = await loadInvite(prisma, token, now);
  return { name: invite.user.name, email: invite.user.email, expiresAt: invite.expiresAt };
}

export async function acceptInvite(prisma, token, password, now = new Date()) {
  const invite = await loadInvite(prisma, token, now);
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    // Conditional update: two clicks at the same moment can't both succeed.
    const { count } = await tx.inviteToken.updateMany({
      where: { id: invite.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) throw new AppError(410, "INVITE_USED", "This invite link has already been used");

    const u = await tx.user.update({
      where: { id: invite.userId },
      data: { passwordHash, passwordChangedAt: now, mustChangePassword: false },
    });
    await writeAudit(tx, {
      actor: { id: u.id, role: u.role },
      action: AuditAction.INVITE_ACCEPTED,
      targetType: AuditTarget.INVITE,
      targetId: invite.id,
      metadata: { contractorId: u.id },
    });
    return u;
  });
  return { user, session: signSession(user) };
}
