// Authentication logic. Controllers stay thin; everything here is unit-tested.
import { AppError } from "../../lib/AppError.js";
import { MINUTE, addMs } from "../../lib/time.js";
import { writeAudit, AuditAction, AuditTarget } from "../../audit/audit.js";
import { hashPassword, verifyPassword, burnPasswordCheck } from "../../auth/password.js";
import { signSession, randomToken, sha256, randomOtp, hashOtp, safeEqualHex } from "../../auth/tokens.js";
import { sendMail } from "../../mail/mailer.js";
import { otpEmail, resetEmail } from "../../mail/templates.js";
import { env } from "../../config/env.js";

export const LOCKOUT = Object.freeze({ maxFailedAttempts: 5, durationMs: 15 * MINUTE });
export const OTP = Object.freeze({ ttlMs: 10 * MINUTE, maxAttempts: 5, resendCooldownMs: 60 * 1000 });
export const RESET_TTL_MS = 30 * MINUTE;

const invalidCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");

/** What the web app gets about the signed-in user. */
export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    departmentId: u.departmentId ?? null,
    emailVerified: u.emailVerified,
    mustChangePassword: u.mustChangePassword,
  };
}

const self = (u) => ({ id: u.id, role: u.role });

// ---------- Signup + email OTP ----------

/** Citizens only: there is no role input, so nobody can sign up as admin or contractor. */
export async function signup(prisma, { name, email, password, phone }) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { name, email, phone: phone ?? null, passwordHash, role: "CITIZEN", emailVerified: false },
      });
      await writeAudit(tx, {
        actor: self(u),
        action: AuditAction.USER_CREATED,
        targetType: AuditTarget.USER,
        targetId: u.id,
        reason: "Citizen self-signup",
        metadata: { role: "CITIZEN" },
      });
      return u;
    });
  } catch (err) {
    if (err?.code === "P2002") throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    throw err;
  }

  // The account exists even if the email fails; the citizen can ask for a new code.
  const otpSent = await issueOtp(prisma, user).then(
    () => true,
    (err) => {
      console.error("Sending signup OTP failed:", err);
      return false;
    },
  );
  return { user, otpSent };
}

/** Create and email a new code. Older unused codes stop working. */
export async function issueOtp(prisma, user, now = new Date()) {
  const last = await prisma.otpCode.findFirst({
    where: { userId: user.id, purpose: "SIGNUP_VERIFY" },
    orderBy: { createdAt: "desc" },
  });
  if (last && now.getTime() - last.createdAt.getTime() < OTP.resendCooldownMs) {
    const retryAfterSeconds = Math.ceil((OTP.resendCooldownMs - (now.getTime() - last.createdAt.getTime())) / 1000);
    throw new AppError(429, "OTP_COOLDOWN", "Wait before asking for a new code", { retryAfterSeconds });
  }

  const code = randomOtp();
  await prisma.$transaction([
    // Retire older codes (marked used, never deleted).
    prisma.otpCode.updateMany({
      where: { userId: user.id, purpose: "SIGNUP_VERIFY", usedAt: null },
      data: { usedAt: now },
    }),
    prisma.otpCode.create({
      data: {
        userId: user.id,
        purpose: "SIGNUP_VERIFY",
        codeHash: hashOtp(user.id, code),
        expiresAt: addMs(now, OTP.ttlMs),
        createdAt: now,
      },
    }),
  ]);
  await sendMail({ to: user.email, ...otpEmail({ name: user.name, code, minutes: OTP.ttlMs / MINUTE }) });
}

export async function verifyEmail(prisma, user, code, now = new Date()) {
  if (user.emailVerified) return { alreadyVerified: true };

  const otp = await prisma.otpCode.findFirst({
    where: { userId: user.id, purpose: "SIGNUP_VERIFY", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt <= now) throw new AppError(400, "OTP_EXPIRED", "The code has expired. Ask for a new one");
  if (otp.attempts >= OTP.maxAttempts) {
    throw new AppError(400, "OTP_TOO_MANY_ATTEMPTS", "Too many wrong codes. Ask for a new one");
  }

  if (!safeEqualHex(otp.codeHash, hashOtp(user.id, code))) {
    const updated = await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    const attemptsLeft = Math.max(0, OTP.maxAttempts - updated.attempts);
    throw new AppError(400, "OTP_INVALID", "Wrong code", { attemptsLeft });
  }

  await prisma.$transaction(async (tx) => {
    // Conditional update: the same code can't be used twice, even by two requests at once.
    const { count } = await tx.otpCode.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: now } });
    if (count !== 1) throw new AppError(400, "OTP_EXPIRED", "The code has expired. Ask for a new one");
    await tx.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    await writeAudit(tx, {
      actor: self(user),
      action: AuditAction.EMAIL_VERIFIED,
      targetType: AuditTarget.USER,
      targetId: user.id,
    });
  });
  return { alreadyVerified: false };
}

// ---------- Login ----------

/**
 * One login for every role. The role comes from the account.
 * Wrong email, wrong password and "no password yet" all give the same INVALID_CREDENTIALS.
 * Locked / deactivated are only revealed after a correct password.
 */
export async function login(prisma, { email, password }, now = new Date()) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    await burnPasswordCheck(password);
    throw invalidCredentials();
  }

  // An expired lock lifts by itself.
  if (user.status === "LOCKED" && user.lockedUntil && user.lockedUntil <= now) {
    user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: { status: "ACTIVE", lockedUntil: null, failedLoginCount: 0 },
      });
      await writeAudit(tx, {
        actor: null,
        action: AuditAction.USER_UNLOCKED,
        targetType: AuditTarget.USER,
        targetId: u.id,
        reason: "Lock period ended",
      });
      return u;
    });
  }

  const ok = await verifyPassword(password, user.passwordHash);

  if (!ok) {
    if (user.status === "ACTIVE") await recordFailedLogin(prisma, user, now);
    throw invalidCredentials();
  }

  if (user.status === "LOCKED") {
    const retryAfterMinutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - now.getTime()) / MINUTE));
    throw new AppError(423, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later", { retryAfterMinutes });
  }
  if (user.status === "DEACTIVATED") {
    throw new AppError(403, "ACCOUNT_DEACTIVATED", "This account has been deactivated");
  }

  user = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lastLoginAt: now },
  });
  return { user, session: signSession(user) };
}

async function recordFailedLogin(prisma, user, now) {
  // Atomic increment, so parallel wrong attempts all count.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (updated.failedLoginCount < LOCKOUT.maxFailedAttempts) return;

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: user.id, status: "ACTIVE" },
      data: { status: "LOCKED", lockedUntil: addMs(now, LOCKOUT.durationMs) },
    });
    if (count !== 1) return; // already locked by a parallel request
    await writeAudit(tx, {
      actor: null,
      action: AuditAction.USER_LOCKED,
      targetType: AuditTarget.USER,
      targetId: user.id,
      reason: `${LOCKOUT.maxFailedAttempts} failed login attempts`,
      metadata: { lockedMinutes: LOCKOUT.durationMs / MINUTE },
    });
  });
}

// ---------- Password change / reset ----------

export async function changePassword(prisma, sessionUser, { currentPassword, newPassword }, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, "WRONG_CURRENT_PASSWORD", "Current password is wrong");
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new AppError(400, "PASSWORD_UNCHANGED", "Choose a password different from the current one");
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: now },
    });
    await writeAudit(tx, {
      actor: self(user),
      action: AuditAction.PASSWORD_CHANGED,
      targetType: AuditTarget.USER,
      targetId: user.id,
      reason: user.mustChangePassword ? "Required change of initial password" : "Changed by the user",
    });
    return u;
  });
  // Old sessions are now invalid; hand back a fresh one.
  return { user: updated, session: signSession(updated) };
}

/** Always resolves the same way, whether or not the email exists. */
export async function forgotPassword(prisma, { email }, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || user.status === "DEACTIVATED") return;

  const token = randomToken();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { expiresAt: now } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: addMs(now, RESET_TTL_MS), createdAt: now },
    }),
  ]);
  const link = `${env.WEB_ORIGIN}/reset-password?token=${token}`;
  await sendMail({ to: user.email, ...resetEmail({ name: user.name, link, minutes: RESET_TTL_MS / MINUTE }) }).catch(
    (err) => console.error("Sending reset email failed:", err),
  );
}

export async function resetPassword(prisma, { token, newPassword }, now = new Date()) {
  const invalid = () => new AppError(400, "RESET_LINK_INVALID", "This reset link is invalid or has expired");
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt <= now || record.user.status === "DEACTIVATED") throw invalid();

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) throw invalid();
    // Proving ownership of the email also lifts a lockout.
    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        status: record.user.status === "LOCKED" ? "ACTIVE" : record.user.status,
      },
    });
    await writeAudit(tx, {
      actor: self(record.user),
      action: AuditAction.PASSWORD_RESET,
      targetType: AuditTarget.USER,
      targetId: record.userId,
      reason: "Reset through emailed link",
    });
  });
}
