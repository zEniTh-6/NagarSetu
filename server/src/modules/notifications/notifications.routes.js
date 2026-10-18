import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../auth/middleware.js";
import { makeNotificationsController } from "./notifications.controller.js";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});
const idParams = z.object({ id: z.string().uuid() });

/** /api/notifications — any signed-in user, only their own. */
export function notificationsRouter({ prisma }) {
  const r = Router();
  const c = makeNotificationsController(prisma);
  r.use(requireAuth(prisma));
  r.get("/", validate({ query: listQuery }), c.list);
  r.post("/read-all", c.readAll);
  r.post("/:id/read", validate({ params: idParams }), c.read);
  return r;
}
