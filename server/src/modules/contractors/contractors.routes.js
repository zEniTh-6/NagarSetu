import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { passwordSchema } from "../../auth/password.js";
import { tokenFormat } from "../../auth/tokens.js";
import { emailSchema, nameSchema, phoneSchema } from "../../lib/schemas.js";
import { makeContractorsController } from "./contractors.controller.js";

const optionalText = z.string().trim().max(100).optional().transform((v) => (v ? v : undefined));

const details = {
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  workType: optionalText, // e.g. roads, electrical, sanitation — information for admins, not a restriction
  licenceNumber: optionalText,
};
const createBody = z.object({ ...details, confirmSimilar: z.boolean().optional() }).strict();
const similarBody = z
  .object({ name: nameSchema, phone: phoneSchema.optional(), licenceNumber: optionalText })
  .strict();
const idParams = z.object({ id: z.string().uuid() });
const deactivateBody = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
const listQuery = z
  .object({
    search: z.string().trim().max(100).optional(),
    includeInactive: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  })
  .strict();
const tokenParams = z.object({ token: z.string().regex(tokenFormat, "invalid link") });
const acceptBody = z.object({ password: passwordSchema }).strict();

/** /api/admin/contractors — admins only. */
export function adminContractorsRouter({ prisma }) {
  const r = Router();
  const c = makeContractorsController(prisma);
  r.use(requireAuth(prisma), requireRole("ADMIN"));
  r.get("/", validate({ query: listQuery }), c.list);
  r.post("/similar", validate({ body: similarBody }), c.similar);
  r.post("/", validate({ body: createBody }), c.create);
  r.post("/:id/invite", validate({ params: idParams }), c.reissueInvite);
  r.post("/:id/deactivate", validate({ params: idParams, body: deactivateBody }), c.deactivate);
  return r;
}

/** /api/invites — public (the token is the credential). */
export function invitesRouter({ prisma, limiters }) {
  const r = Router();
  const c = makeContractorsController(prisma);
  r.get("/:token", limiters.inviteAccept, validate({ params: tokenParams }), c.getInvite);
  r.post("/:token/accept", limiters.inviteAccept, validate({ params: tokenParams, body: acceptBody }), c.acceptInvite);
  return r;
}
