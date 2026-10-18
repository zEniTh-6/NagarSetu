// The session JWT lives in an httpOnly cookie, so page scripts can't read it.
// SameSite=Strict keeps other sites from sending it (CSRF); localhost:5173 and :4000 are the same site.
import { env } from "../config/env.js";

export const SESSION_COOKIE = "nagarsetu_session";

const base = () => ({
  httpOnly: true,
  sameSite: "strict",
  secure: env.NODE_ENV === "production",
  path: "/api",
});

export function setSessionCookie(res, { token, ttlMs }) {
  res.cookie(SESSION_COOKIE, token, { ...base(), maxAge: ttlMs });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, base());
}
