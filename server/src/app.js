// Builds the Express app. server.js only listens; tests import this file with Supertest.
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.js";
import { prisma as defaultPrisma } from "./db/prisma.js";
import { healthRouter } from "./routes/health.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/**
 * @param {object} [options]
 * @param {import("express").Router} [options.extraRoutes] mounted before the 404 handler (tests only)
 */
export function createApp({ prisma = defaultPrisma, config = env, extraRoutes } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false);

  app.use(helmet());
  // Only the web dev origin may call the API from a browser.
  app.use(cors({ origin: [config.WEB_ORIGIN], credentials: true }));
  app.use(express.json({ limit: config.JSON_BODY_LIMIT }));

  app.use("/api/health", healthRouter({ prisma }));
  if (extraRoutes) app.use(extraRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
export default app;
