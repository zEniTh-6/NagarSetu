import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { passwordSchema } from "../../auth/password.js";
import { tokenFormat } from "../../auth/tokens.js";
import { emailSchema, nameSchema, phoneSchema } from "../../lib/schemas.js";
import { makeAuthController } from "./auth.controller.js";

// .strict(): unknown fields (e.g. "role") are rejected, so signup can only ever create a citizen.
const signupBody = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema, phone: phoneSchema.optional() })
  .strict();
// Login doesn't apply the password rules (old passwords may not match today's rules).
const loginBody = z.object({ email: emailSchema, password: z.string().min(1).max(200) }).strict();
const codeBody = z.object({ code: z.string().regex(/^\d{6}$/, "must be 6 digits") }).strict();
const changeBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }).strict();
const forgotBody = z.object({ email: emailSchema }).strict();
const resetBody = z.object({ token: z.string().regex(tokenFormat), newPassword: passwordSchema }).strict();

export function authRouter({ prisma, limiters }) {
  const r = Router();
  const c = makeAuthController(prisma);
  const signedIn = requireAuth(prisma, { allowPasswordChange: true });

  r.post("/signup", limiters.signup, validate({ body: signupBody }), c.signup);
  r.post("/login", limiters.login, validate({ body: loginBody }), c.login);
  r.post("/logout", c.logout);
  r.get("/me", signedIn, c.me);

  r.post("/verify-email", requireAuth(prisma), requireRole("CITIZEN"), limiters.otpVerify, validate({ body: codeBody }), c.verifyEmail);
  r.post("/verify-email/resend", requireAuth(prisma), requireRole("CITIZEN"), limiters.otpResend, c.resendOtp);

  r.post("/change-password", signedIn, validate({ body: changeBody }), c.changePassword);
  r.post("/forgot-password", limiters.forgotPassword, validate({ body: forgotBody }), c.forgotPassword);
  r.post("/reset-password", limiters.forgotPassword, validate({ body: resetBody }), c.resetPassword);
  return r;
}
