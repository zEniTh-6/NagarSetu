// Rate limits (in memory, per server process; enough for one modular app, no Redis).
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { HOUR, MINUTE } from "../lib/time.js";

export const DEFAULT_LIMITS = Object.freeze({
  signup: { windowMs: HOUR, limit: 5 }, // per IP
  login: { windowMs: 15 * MINUTE, limit: 10 }, // per IP + email
  otpVerify: { windowMs: 15 * MINUTE, limit: 10 }, // per user
  otpResend: { windowMs: 15 * MINUTE, limit: 3 }, // per user
  forgotPassword: { windowMs: HOUR, limit: 5 }, // per IP
  inviteAccept: { windowMs: 15 * MINUTE, limit: 10 }, // per IP
  report: { windowMs: HOUR, limit: 10 }, // per user
  duplicateCheck: { windowMs: HOUR, limit: 60 }, // per user (one per report form, plus edits)
  // Attached in later phases:
  upvote: { windowMs: HOUR, limit: 100 }, // per user
  comment: { windowMs: HOUR, limit: 30 }, // per user
});

const byIp = (req) => ipKeyGenerator(req.ip ?? "unknown");
const byUser = (req) => (req.user ? `user:${req.user.id}` : byIp(req));
const byIpAndEmail = (req) => `${byIp(req)}|${String(req.body?.email ?? "").trim().toLowerCase()}`;

const KEYS = {
  signup: byIp,
  login: byIpAndEmail,
  otpVerify: byUser,
  otpResend: byUser,
  forgotPassword: byIp,
  inviteAccept: byIp,
  report: byUser,
  duplicateCheck: byUser,
  upvote: byUser,
  comment: byUser,
};

/** Creates fresh limiters (one set per app instance). `overrides` lets tests change limits. */
export function createRateLimiters(overrides = {}) {
  const limiters = {};
  for (const [name, defaults] of Object.entries(DEFAULT_LIMITS)) {
    const { windowMs, limit } = { ...defaults, ...overrides[name] };
    limiters[name] = rateLimit({
      windowMs,
      limit,
      keyGenerator: KEYS[name],
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests, try again later" } }),
    });
  }
  return limiters;
}
