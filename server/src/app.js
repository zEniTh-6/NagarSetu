// Builds the Express app. server.js only listens; tests import this file with Supertest.
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { prisma as defaultPrisma } from "./db/prisma.js";
import { healthRouter } from "./routes/health.js";
import { createRateLimiters } from "./middleware/rateLimit.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { adminContractorsRouter, invitesRouter } from "./modules/contractors/contractors.routes.js";
import { issuesRouter, photosRouter, categoriesRouter } from "./modules/issues/issues.routes.js";
import { adminIssuesRouter } from "./modules/admin/admin.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { contractorRouter } from "./modules/work/contractor.routes.js";
import { feedRouter, commentsRouter } from "./modules/feed/feed.routes.js";
import { createLocalDiskStorage } from "./storage/storage.js";
import { createMemoryQueue } from "./jobs/queue.js";
import { embed as geminiEmbed } from "./ai/embed.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/**
 * @param {object} [options]
 * @param {object} [options.storage] photo storage (default: local disk)
 * @param {object} [options.jobs] background job queue (default: in-memory recorder; server.js passes pg-boss)
 * @param {(text: string) => Promise<number[]>} [options.embed] text embedding function (default: Gemini)
 * @param {object} [options.rateLimits] per-limiter overrides, e.g. { login: { limit: 3 } } (tests)
 * @param {(deps) => import("express").Router} [options.extraRoutes] mounted before the 404 handler (tests only)
 */
export function createApp({
  prisma = defaultPrisma,
  config = env,
  storage = createLocalDiskStorage(),
  jobs = createMemoryQueue(),
  embed = geminiEmbed,
  rateLimits,
  extraRoutes,
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false);

  // Photos are loaded by the web app (localhost:5173) from the API (localhost:4000): same site.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  // Only the web dev origin may call the API from a browser.
  app.use(cors({ origin: [config.WEB_ORIGIN], credentials: true }));
  app.use(express.json({ limit: config.JSON_BODY_LIMIT }));
  app.use(cookieParser());

  const limiters = createRateLimiters(rateLimits);
  const deps = { prisma, limiters, storage, jobs, embed };

  app.use("/api/health", healthRouter(deps));
  app.use("/api/auth", authRouter(deps));
  app.use("/api/admin/contractors", adminContractorsRouter(deps));
  app.use("/api/admin", adminIssuesRouter(deps));
  app.use("/api/invites", invitesRouter(deps));
  app.use("/api/issues", issuesRouter(deps));
  app.use("/api/photos", photosRouter(deps));
  app.use("/api/categories", categoriesRouter(deps));
  app.use("/api/notifications", notificationsRouter(deps));
  app.use("/api/contractor", contractorRouter(deps));
  app.use("/api/feed", feedRouter(deps));
  app.use("/api/comments", commentsRouter(deps));
  if (extraRoutes) app.use(extraRoutes(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
export default app;
