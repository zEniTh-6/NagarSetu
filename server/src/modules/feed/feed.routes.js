import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { requireAuth, requireRole, requireVerified } from "../../auth/middleware.js";
import { bboxSchema } from "../../geo/public.js";
import * as feed from "./feed.service.js";
import * as community from "./community.service.js";

const categoryKey = z.string().regex(/^[A-Z_]{2,40}$/);
const page = z.coerce.number().int().min(1).default(1);
const feedQuery = z.object({ category: categoryKey.optional(), page, pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict();
// bbox=minLng,minLat,maxLng,maxLat (what Leaflet's getBounds().toBBoxString() gives)
const mapQuery = z
  .object({
    bbox: z.string().transform((v, ctx) => {
      const n = v.split(",").map(Number);
      const parsed = bboxSchema.safeParse({ minLng: n[0], minLat: n[1], maxLng: n[2], maxLat: n[3] });
      if (n.length !== 4 || !parsed.success) {
        ctx.addIssue({ code: "custom", message: "use minLng,minLat,maxLng,maxLat" });
        return z.NEVER;
      }
      return parsed.data;
    }),
    category: categoryKey.optional(),
  })
  .strict();
const idParams = z.object({ id: z.string().uuid() });
const reportBody = z
  .object({
    reason: z.enum(["SPAM", "ABUSIVE", "OFF_TOPIC", "OTHER"]),
    // Stored as written; empty counts as missing.
    note: z.preprocess((v) => (typeof v === "string" && !v.trim() ? undefined : v), z.string().max(500).optional()),
  })
  .strict();

/** /api/feed — public feed and map (D-022, D-025). Signed-in citizens only. */
export function feedRouter({ prisma }) {
  const r = Router();
  r.use(requireAuth(prisma), requireRole("CITIZEN"));
  r.get("/", validate({ query: feedQuery }), async (req, res) => {
    res.json(await feed.listFeed(prisma, { user: req.user, ...req.validated.query }));
  });
  r.get("/map", validate({ query: mapQuery }), async (req, res) => {
    res.json(await feed.mapPins(prisma, req.validated.query));
  });
  return r;
}

/** /api/comments — report a comment. */
export function commentsRouter({ prisma, limiters }) {
  const r = Router();
  r.post("/:id/report", requireAuth(prisma), requireRole("CITIZEN"), requireVerified, limiters.comment, validate({ params: idParams, body: reportBody }), async (req, res) => {
    res.json(await community.reportComment(prisma, { user: req.user, commentId: req.validated.params.id, ...req.validated.body }));
  });
  return r;
}
