import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { singlePhoto } from "../../middleware/upload.js";
import { requireAuth, requireRole, requireVerified } from "../../auth/middleware.js";
import { makeIssuesController } from "./issues.controller.js";

// Multipart fields arrive as text; numbers are coerced. Empty optional fields count as missing.
const blankToUndefined = (v) => (v === "" || v === null ? undefined : v);
const optionalNumber = (schema) => z.preprocess(blankToUndefined, z.coerce.number().pipe(schema).optional());
const optionalDate = z.preprocess(blankToUndefined, z.coerce.date().optional());

const createBody = z
  .object({
    clientRequestId: z.string().uuid(),
    categoryKey: z.string().regex(/^[A-Z_]{2,40}$/),
    // Stored exactly as written (any language/script); only checked for length.
    description: z.string().refine((s) => s.trim().length >= 5, "at least 5 characters").refine((s) => s.length <= 2000, "at most 2000 characters"),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    addressText: z.preprocess(blankToUndefined, z.string().trim().max(300).optional()),
    deviceLat: optionalNumber(z.number().min(-90).max(90)),
    deviceLng: optionalNumber(z.number().min(-180).max(180)),
    deviceAccuracyM: optionalNumber(z.number().min(0).max(100_000)),
    capturedAt: optionalDate,
    // Ids of similar reports the citizen saw in the duplicate popup and declined (comma-separated).
    duplicateCandidateIds: z.preprocess(
      (v) => (typeof v === "string" ? (v.trim() ? v.split(",").map((x) => x.trim()) : undefined) : v),
      z.array(z.string().uuid()).max(5).optional(),
    ),
  })
  .strict()
  .refine((b) => (b.deviceLat == null) === (b.deviceLng == null), {
    message: "send both deviceLat and deviceLng, or neither",
    path: ["deviceLat"],
  });

const idParams = z.object({ id: z.string().uuid() });
const duplicateCheckBody = z
  .object({
    categoryKey: z.string().regex(/^[A-Z_]{2,40}$/),
    description: z.string().refine((s) => s.trim().length >= 5, "at least 5 characters").refine((s) => s.length <= 2000, "at most 2000 characters"),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();
const supportBody = z.object({ fromDuplicatePopup: z.boolean().optional() }).strict();
const retakeBody = z.object({ capturedAt: optionalDate }).strict();
const withdrawBody = z.object({ reason: z.string().trim().min(1).max(500).optional() }).strict();
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const photoQuery = z.object({ variant: z.enum(["public", "original"]).default("public") });

export function issuesRouter({ prisma, limiters, storage, jobs, embed }) {
  const r = Router();
  const c = makeIssuesController({ prisma, storage, jobs, embed });
  const citizen = [requireAuth(prisma), requireRole("CITIZEN")];

  r.post("/", ...citizen, requireVerified, limiters.report, singlePhoto(), validate({ body: createBody }), c.create);
  r.post("/duplicate-check", ...citizen, requireVerified, limiters.duplicateCheck, validate({ body: duplicateCheckBody }), c.duplicateCheck);
  r.get("/mine", ...citizen, validate({ query: pageQuery }), c.mine);
  r.post("/:id/support", ...citizen, requireVerified, limiters.upvote, validate({ params: idParams, body: supportBody }), c.support);
  r.post("/:id/photo", ...citizen, requireVerified, limiters.report, singlePhoto(), validate({ params: idParams, body: retakeBody }), c.retakePhoto);
  r.post("/:id/withdraw", ...citizen, validate({ params: idParams, body: withdrawBody }), c.withdraw);
  r.get("/:id", requireAuth(prisma), validate({ params: idParams }), c.getOne);
  return r;
}

export function photosRouter({ prisma, storage, jobs }) {
  const r = Router();
  const c = makeIssuesController({ prisma, storage, jobs });
  r.get("/:id", requireAuth(prisma), validate({ params: idParams, query: photoQuery }), c.photo);
  return r;
}

export function categoriesRouter({ prisma }) {
  const r = Router();
  const c = makeIssuesController({ prisma });
  r.get("/", c.categories);
  return r;
}
