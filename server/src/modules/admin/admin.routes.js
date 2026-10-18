import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { makeAdminIssuesController } from "./admin.controller.js";

const LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES = ["REPORTED", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "REJECTED", "DUPLICATE", "WITHDRAWN"];
const FLAGS = ["SUSPICIOUS", "POSSIBLE_DUPLICATE", "PENDING_REVIEW", "ESCALATED", "DISPUTED"];

// Reasons are shown to the citizen (or kept in the audit log) exactly as written.
const reason = z.string().trim().min(3).max(1000);
const optionalReason = z.string().trim().max(1000).optional().transform((v) => (v ? v : undefined));
const categoryKey = z.string().regex(/^[A-Z_]{2,40}$/);

const listQuery = z
  .object({
    status: z.enum([...STATUSES, "ACTIVE", "ALL"]).default("REPORTED"),
    category: categoryKey.optional(),
    flag: z.enum(FLAGS).optional(),
    priority: z.enum([...LEVELS, "NONE"]).optional(),
    sort: z.enum(["newest", "oldest", "risk", "priority", "support"]).default("newest"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
const idParams = z.object({ id: z.string().uuid() });
const flagParams = z.object({ id: z.string().uuid(), flagId: z.string().uuid() });

const acceptBody = z
  .object({ priority: z.enum(LEVELS).optional(), priorityReason: optionalReason })
  .strict()
  .refine((b) => b.priority || !b.priorityReason, { message: "priorityReason needs a priority", path: ["priorityReason"] });
const rejectBody = z.object({ type: z.enum(["NOT_VALID", "OTHER"]), reason }).strict();
const forwardBody = z.object({ reason }).strict(); // e.g. "State highway — forwarded to PWD Sangli"
const linkBody = z.object({ targetIssueId: z.string().uuid(), reason: optionalReason }).strict();
const rerouteBody = z.object({ categoryKey, reason }).strict();
const priorityBody = z.object({ priority: z.enum(LEVELS), reason: optionalReason }).strict();
const flagBody = z.object({ reason }).strict();

/** /api/admin — department admins only; every query is limited to their department. */
export function adminIssuesRouter({ prisma, jobs }) {
  const r = Router();
  const c = makeAdminIssuesController({ prisma, jobs });
  r.use(requireAuth(prisma), requireRole("ADMIN"));

  r.get("/dashboard", c.dashboard);
  r.get("/issues", validate({ query: listQuery }), c.list);
  r.post("/issues/:id/accept", validate({ params: idParams, body: acceptBody }), c.accept);
  r.post("/issues/:id/reject", validate({ params: idParams, body: rejectBody }), c.reject);
  r.post("/issues/:id/forward", validate({ params: idParams, body: forwardBody }), c.forward);
  r.post("/issues/:id/link-duplicate", validate({ params: idParams, body: linkBody }), c.linkDuplicate);
  r.post("/issues/:id/reroute", validate({ params: idParams, body: rerouteBody }), c.reroute);
  r.post("/issues/:id/priority", validate({ params: idParams, body: priorityBody }), c.priority);
  r.post("/issues/:id/flags/:flagId/clear", validate({ params: flagParams, body: flagBody }), c.clearFlag);
  r.post("/issues/:id/flags/:flagId/confirm", validate({ params: flagParams, body: flagBody }), c.confirmFlag);
  return r;
}
