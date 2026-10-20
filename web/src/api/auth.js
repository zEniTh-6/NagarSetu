// The server's auth and invite endpoints (server/src/modules/auth, server/src/modules/contractors).
import { api } from "./client.js";

const open = { authRedirect: false }; // logged-out screens: errors are answers, not "session gone"

export const authApi = {
  /** → { user } · 401 NOT_AUTHENTICATED / SESSION_EXPIRED when logged out */
  me: () => api("/auth/me", open),
  /** → { user, expiresInSeconds } · 401 INVALID_CREDENTIALS · 423 ACCOUNT_LOCKED · 403 ACCOUNT_DEACTIVATED */
  login: ({ email, password }) => api("/auth/login", { ...open, method: "POST", body: { email, password } }),
  logout: () => api("/auth/logout", { ...open, method: "POST" }),
  /** Citizens only. → 201 { user, otpSent } · 409 EMAIL_TAKEN. Does not start a session. */
  signup: ({ name, email, password, phone }) =>
    api("/auth/signup", { ...open, method: "POST", body: { name, email, password, ...(phone ? { phone } : {}) } }),
  /** → { verified, alreadyVerified } · 400 OTP_INVALID {attemptsLeft} / OTP_EXPIRED / OTP_TOO_MANY_ATTEMPTS */
  verifyEmail: (code) => api("/auth/verify-email", { method: "POST", body: { code } }),
  /** → { sent } · 429 OTP_COOLDOWN {retryAfterSeconds} */
  resendOtp: () => api("/auth/verify-email/resend", { method: "POST" }),
  /** → { user } (fresh session) · 400 WRONG_CURRENT_PASSWORD / PASSWORD_UNCHANGED */
  changePassword: ({ currentPassword, newPassword }) =>
    api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  /** Always 202, whether or not the email exists. */
  forgotPassword: (email) => api("/auth/forgot-password", { ...open, method: "POST", body: { email } }),
  /** → { reset: true } · 400 RESET_LINK_INVALID */
  resetPassword: ({ token, newPassword }) =>
    api("/auth/reset-password", { ...open, method: "POST", body: { token, newPassword } }),
};

export const invitesApi = {
  /** → { invite: { name, email, expiresAt } } · 404 INVITE_NOT_FOUND · 410 INVITE_USED / INVITE_EXPIRED */
  get: (token) => api(`/invites/${encodeURIComponent(token)}`, open),
  /** → { user } and a session cookie */
  accept: (token, password) =>
    api(`/invites/${encodeURIComponent(token)}/accept`, { ...open, method: "POST", body: { password } }),
};

/** Same formats the server checks, so a malformed link fails before a request. */
export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72;
