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
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/**
 * @param {object} [options]
 * @param {object} [options.rateLimits] per-limiter overrides, e.g. { login: { limit: 3 } } (tests)
 * @param {(deps) => import("express").Router} [options.extraRoutes] mounted before the 404 handler (tests only)
 */
export function createApp({ prisma = defaultPrisma, config = env, rateLimits, extraRoutes } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false);

  app.use(helmet());
  // Only the web dev origin may call the API from a browser.
  app.use(cors({ origin: [config.WEB_ORIGIN], credentials: true }));
  app.use(express.json({ limit: config.JSON_BODY_LIMIT }));
  app.use(cookieParser());

  const limiters = createRateLimiters(rateLimits);
  const deps = { prisma, limiters };

  app.use("/api/health", healthRouter(deps));
  app.use("/api/auth", authRouter(deps));
  app.use("/api/admin/contractors", adminContractorsRouter(deps));
  app.use("/api/invites", invitesRouter(deps));
  if (extraRoutes) app.use(extraRoutes(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
export default app;
