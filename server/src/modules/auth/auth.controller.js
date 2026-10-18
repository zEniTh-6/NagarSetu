import * as auth from "./auth.service.js";
import { setSessionCookie, clearSessionCookie } from "../../auth/cookies.js";

export const makeAuthController = (prisma) => ({
  async signup(req, res) {
    const { user, otpSent } = await auth.signup(prisma, req.validated.body);
    res.status(201).json({ user: auth.publicUser(user), otpSent });
  },

  async login(req, res) {
    const { user, session } = await auth.login(prisma, req.validated.body);
    setSessionCookie(res, session);
    res.json({ user: auth.publicUser(user), expiresInSeconds: Math.floor(session.ttlMs / 1000) });
  },

  logout(_req, res) {
    clearSessionCookie(res);
    res.status(204).end();
  },

  me(req, res) {
    res.json({ user: auth.publicUser(req.user) });
  },

  async verifyEmail(req, res) {
    const result = await auth.verifyEmail(prisma, req.user, req.validated.body.code);
    res.json({ verified: true, ...result });
  },

  async resendOtp(req, res) {
    if (req.user.emailVerified) return res.json({ sent: false, alreadyVerified: true });
    await auth.issueOtp(prisma, req.user);
    res.json({ sent: true });
  },

  async changePassword(req, res) {
    const { user, session } = await auth.changePassword(prisma, req.user, req.validated.body);
    setSessionCookie(res, session);
    res.json({ user: auth.publicUser(user) });
  },

  async forgotPassword(req, res) {
    await auth.forgotPassword(prisma, req.validated.body);
    res.status(202).json({ message: "If this email is registered, a reset link has been sent." });
  },

  async resetPassword(req, res) {
    await auth.resetPassword(prisma, req.validated.body);
    clearSessionCookie(res);
    res.json({ reset: true });
  },
});
