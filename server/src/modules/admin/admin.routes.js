import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { makeAdminIssuesController } from "./admin.controller.js";
import * as community from "../feed/community.service.js";
import * as queues from "./queues.service.js";
import { listAuditLog, AUDIT_ACTIONS, AUDIT_TARGETS, AUDIT_ACTORS } from "./auditLog.service.js";

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
    // Reference (first characters of the id, "#" optional), description or address.
    q: z.string().trim().max(100).optional().transform((v) => (v ? v : undefined)),
    from: z.coerce.date().optional(), // reported on or after
    to: z.coerce.date().optional(), // reported before (exclusive)
    stage: z.enum(["REPAIR_REVIEW"]).optional(), // a repair submission waits for the admin
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
const deadlineAt = z.coerce.date();
const assignBody = z.object({ contractorId: z.string().uuid(), deadlineAt }).strict();
const reassignBody = z.object({ contractorId: z.string().uuid(), deadlineAt, reason }).strict();
const deadlineBody = z.object({ deadlineAt, reason }).strict();
const approveBody = z.object({ note: optionalReason }).strict();
const rejectRepairBody = z.object({ reason }).strict(); // sent to the contractor
const disputeBody = z.object({ reason }).strict(); // shown to the citizens
const hideBody = z.object({ reason }).strict(); // kept in the audit log
// Shown to everyone exactly as written, signed with the department's name.
const replyBody = z
  .object({ body: z.string().refine((s) => s.trim().length >= 3, "at least 3 characters").refine((s) => s.length <= 1000, "at most 1000 characters") })
  .strict();
const queuePage = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) };
const submissionsQuery = z.object({ status: z.enum(["SUBMITTED", "APPROVED", "REJECTED"]).default("SUBMITTED"), ...queuePage }).strict();
const disputesQuery = z.object(queuePage).strict();
const moderationQuery = z.object({ filter: z.enum(["reported", "hidden"]).default("reported"), ...queuePage }).strict();
const suspendBody = z.object({ reason }).strict(); // kept in the audit log
const auditQuery = z
  .object({
    action: z.enum(AUDIT_ACTIONS).optional(),
    actor: z.enum(AUDIT_ACTORS).optional(),
    target: z.enum(AUDIT_TARGETS).optional(),
    issue: z.string().trim().max(40).optional().transform((v) => (v ? v : undefined)),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const pageQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).strict();

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
  r.post("/issues/:id/assign", validate({ params: idParams, body: assignBody }), c.assign);
  r.post("/issues/:id/reassign", validate({ params: idParams, body: reassignBody }), c.reassign);
  r.post("/issues/:id/deadline", validate({ params: idParams, body: deadlineBody }), c.deadline);
  r.post("/issues/:id/reopen", validate({ params: idParams, body: disputeBody }), c.reopen);
  r.post("/issues/:id/dispute/dismiss", validate({ params: idParams, body: disputeBody }), c.dismissDispute);
  r.post("/submissions/:id/approve", validate({ params: idParams, body: approveBody }), c.approveSubmission);
  r.post("/submissions/:id/reject", validate({ params: idParams, body: rejectRepairBody }), c.rejectSubmission);
  r.post("/issues/:id/flags/:flagId/clear", validate({ params: flagParams, body: flagBody }), c.clearFlag);
  r.post("/issues/:id/flags/:flagId/confirm", validate({ params: flagParams, body: flagBody }), c.confirmFlag);
  // Comments and official replies (D-025). The moderation screens come with the admin web app.
  r.get("/issues/:id/comments", validate({ params: idParams, query: pageQuery }), async (req, res) => {
    res.json(await community.adminListComments(prisma, { user: req.user, issueId: req.validated.params.id, ...req.validated.query }));
  });
  r.post("/issues/:id/replies", validate({ params: idParams, body: replyBody }), async (req, res) => {
    res.status(201).json({ comment: await community.postOfficialReply(prisma, { user: req.user, issueId: req.validated.params.id, body: req.validated.body.body }) });
  });
  r.post("/comments/:id/hide", validate({ params: idParams, body: hideBody }), async (req, res) => {
    res.json({ comment: await community.hideComment(prisma, { user: req.user, commentId: req.validated.params.id, reason: req.validated.body.reason }) });
  });
  // Work queues (Phase 7c, D-026).
  r.get("/submissions", validate({ query: submissionsQuery }), async (req, res) => {
    res.json(await queues.listSubmissions(prisma, { user: req.user, ...req.validated.query }));
  });
  r.get("/disputes", validate({ query: disputesQuery }), async (req, res) => {
    res.json(await queues.listDisputes(prisma, { user: req.user, ...req.validated.query }));
  });
  r.get("/comments", validate({ query: moderationQuery }), async (req, res) => {
    res.json(await queues.listModerationComments(prisma, { user: req.user, ...req.validated.query }));
  });
  r.get("/citizens/suspended", validate({ query: disputesQuery }), async (req, res) => {
    res.json(await queues.listSuspendedCitizens(prisma, { user: req.user, ...req.validated.query }));
  });
  r.post("/citizens/:id/suspend", validate({ params: idParams, body: suspendBody }), async (req, res) => {
    res.json({ citizen: await queues.suspendCitizen(prisma, { user: req.user, citizenId: req.validated.params.id, reason: req.validated.body.reason }) });
  });
  r.post("/citizens/:id/reactivate", validate({ params: idParams, body: suspendBody }), async (req, res) => {
    res.json({ citizen: await queues.reactivateCitizen(prisma, { user: req.user, citizenId: req.validated.params.id, reason: req.validated.body.reason }) });
  });
  r.get("/audit-log", validate({ query: auditQuery }), async (req, res) => {
    res.json(await listAuditLog(prisma, { user: req.user, ...req.validated.query }));
  });
  return r;
}
