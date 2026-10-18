// Test app with very high rate limits, so normal tests never hit them.
// test/rateLimit.test.js uses createApp() with low limits to test the limiter itself.
import { createApp } from "../../src/app.js";
import { DEFAULT_LIMITS } from "../../src/middleware/rateLimit.js";

const generous = Object.fromEntries(Object.keys(DEFAULT_LIMITS).map((k) => [k, { limit: 10_000 }]));

export const makeTestApp = (options = {}) =>
  createApp({ ...options, rateLimits: { ...generous, ...options.rateLimits } });
