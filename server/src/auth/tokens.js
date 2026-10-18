// Session JWTs and one-time secrets (invite links, password reset links, OTP codes).
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HOUR } from "../lib/time.js";

/** Session lifetime: shorter for admins (brief: "session expiry shorter for admins"). */
export const SESSION_TTL_MS = Object.freeze({ ADMIN: 2 * HOUR, CITIZEN: 24 * HOUR, CONTRACTOR: 24 * HOUR });

const ALG = "HS256";

/**
 * `pwd` is the time of the last password change. requireAuth compares it with the database,
 * so changing or resetting a password ends every older session.
 */
export function signSession(user) {
  const ttlMs = SESSION_TTL_MS[user.role];
  const token = jwt.sign(
    { role: user.role, pwd: user.passwordChangedAt ? user.passwordChangedAt.getTime() : 0 },
    env.JWT_SECRET,
    { algorithm: ALG, subject: user.id, expiresIn: Math.floor(ttlMs / 1000) },
  );
  return { token, ttlMs };
}

/** Returns the payload, or null if the token is missing, tampered with or expired. */
export function verifySession(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: [ALG] });
  } catch {
    return null;
  }
}

/** 32 random bytes as URL-safe text (43 chars). Used for invite and reset links. */
export const randomToken = () => crypto.randomBytes(32).toString("base64url");
export const tokenFormat = /^[A-Za-z0-9_-]{43}$/;

/** Stored form of a link token. The plain token is never saved. */
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/** 6-digit code. */
export const randomOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

/** Stored form of an OTP: HMAC with a server secret (a plain hash of 6 digits is trivial to reverse). */
export const hashOtp = (userId, code) =>
  crypto.createHmac("sha256", env.OTP_SECRET).update(`${userId}:${code}`).digest("hex");

export function safeEqualHex(a, b) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
