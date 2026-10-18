// Test app: very high rate limits (test/rateLimit.test.js tests the limiter itself with createApp),
// photos in a temporary folder, and an in-memory job queue whose jobs the test runs by hand.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.js";
import { DEFAULT_LIMITS } from "../../src/middleware/rateLimit.js";
import { createLocalDiskStorage } from "../../src/storage/storage.js";
import { createMemoryQueue } from "../../src/jobs/queue.js";

const generous = Object.fromEntries(Object.keys(DEFAULT_LIMITS).map((k) => [k, { limit: 10_000 }]));

export const tempStorage = () => createLocalDiskStorage(fs.mkdtempSync(path.join(os.tmpdir(), "nagarsetu-test-")));

export const makeTestApp = (options = {}) =>
  createApp({
    storage: options.storage ?? tempStorage(),
    jobs: options.jobs ?? createMemoryQueue(),
    ...options,
    rateLimits: { ...generous, ...options.rateLimits },
  });
