import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { singlePhoto } from "../../middleware/upload.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { makeContractorController } from "./contractor.controller.js";

// Multipart fields arrive as text; numbers are coerced. Empty optional fields count as missing.
const blankToUndefined = (v) => (v === "" || v === null ? undefined : v);
const optionalNumber = (schema) => z.preprocess(blankToUndefined, z.coerce.number().pipe(schema).optional());

const idParams = z.object({ id: z.string().uuid() });
const submitBody = z
  .object({
    clientRequestId: z.string().uuid(), // idempotency key: a retried upload can't create two submissions
    note: z.preprocess(blankToUndefined, z.string().trim().max(1000).optional()),
    capturedAt: z.preprocess(blankToUndefined, z.coerce.date().optional()), // original capture time, kept on retries
    deviceLat: optionalNumber(z.number().min(-90).max(90)),
    deviceLng: optionalNumber(z.number().min(-180).max(180)),
    deviceAccuracyM: optionalNumber(z.number().min(0).max(100_000)),
  })
  .strict()
  .refine((b) => (b.deviceLat == null) === (b.deviceLng == null), {
    message: "send both deviceLat and deviceLng, or neither",
    path: ["deviceLat"],
  });

/** /api/contractor — contractors only, and only their current assignments. There is no way to set RESOLVED here. */
export function contractorRouter({ prisma, limiters, storage, jobs }) {
  const r = Router();
  const c = makeContractorController({ prisma, storage, jobs });
  r.use(requireAuth(prisma), requireRole("CONTRACTOR"));
  r.get("/issues", c.list);
  r.get("/issues/:id", validate({ params: idParams }), c.getOne);
  r.post("/issues/:id/start", validate({ params: idParams }), c.start);
  r.post("/issues/:id/submissions", limiters.repairUpload, singlePhoto(), validate({ params: idParams, body: submitBody }), c.submit);
  return r;
}
