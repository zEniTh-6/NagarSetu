import { Router } from "express";

/** GET /api/health — liveness plus a quick database check. */
export function healthRouter({ prisma }) {
  const router = Router();
  router.get("/", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", db: "ok" });
    } catch {
      res.status(503).json({ status: "degraded", db: "unreachable" });
    }
  });
  return router;
}
