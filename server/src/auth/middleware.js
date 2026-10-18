// requireAuth, requireRole, requireVerified. Authorization is always decided on the server.
import { AppError } from "../lib/AppError.js";
import { SESSION_COOKIE, clearSessionCookie } from "./cookies.js";
import { verifySession } from "./tokens.js";

const USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  departmentId: true,
  emailVerified: true,
  mustChangePassword: true,
  passwordChangedAt: true,
};

/**
 * Loads the signed-in user from the database on every request, so deactivation and
 * password changes take effect immediately.
 *
 * While mustChangePassword is true, only routes created with { allowPasswordChange: true }
 * (me, change-password) work; everything else answers 403 PASSWORD_CHANGE_REQUIRED.
 */
export function requireAuth(prisma, { allowPasswordChange = false } = {}) {
  return async (req, res, next) => {
    const payload = verifySession(req.cookies?.[SESSION_COOKIE]);
    if (!payload?.sub) return next(new AppError(401, "NOT_AUTHENTICATED", "Please log in"));

    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: USER_FIELDS });
    const pwd = user?.passwordChangedAt ? user.passwordChangedAt.getTime() : 0;
    if (!user || payload.pwd !== pwd) {
      clearSessionCookie(res);
      return next(new AppError(401, "SESSION_EXPIRED", "Please log in again"));
    }
    if (user.status === "DEACTIVATED") {
      clearSessionCookie(res);
      return next(new AppError(403, "ACCOUNT_DEACTIVATED", "This account has been deactivated"));
    }
    if (user.mustChangePassword && !allowPasswordChange) {
      return next(new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue"));
    }

    req.user = user;
    next();
  };
}

/** Use after requireAuth. Wrong role → 403 (the route exists, but not for you). */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new AppError(403, "FORBIDDEN", "Forbidden"));
    next();
  };
}

/** Use after requireAuth. Citizens must verify their email before reporting or upvoting. */
export function requireVerified(req, _res, next) {
  if (req.user?.role === "CITIZEN" && !req.user.emailVerified) {
    return next(new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email first"));
  }
  next();
}
