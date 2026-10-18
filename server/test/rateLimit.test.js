import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { DEFAULT_LIMITS } from "../src/middleware/rateLimit.js";
import { resetDb } from "./helpers/db.js";

beforeEach(() => resetDb(prisma));
afterAll(() => prisma.$disconnect());

describe("rate limits", () => {
  it("login: too many attempts for one email from one IP → 429", async () => {
    const app = createApp({ rateLimits: { login: { limit: 3 } } });
    const attempt = () => request(app).post("/api/auth/login").send({ email: "x@example.com", password: "whatever-1" });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const res = await attempt();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("signup and forgot-password are limited per IP", async () => {
    const app = createApp({ rateLimits: { signup: { limit: 1 }, forgotPassword: { limit: 1 } } });
    await request(app).post("/api/auth/signup").send({ name: "A B", email: "a@example.com", password: "Long-Enough-1" }).expect(201);
    expect((await request(app).post("/api/auth/signup").send({ name: "C D", email: "c@example.com", password: "Long-Enough-1" })).status).toBe(429);
    await request(app).post("/api/auth/forgot-password").send({ email: "a@example.com" }).expect(202);
    expect((await request(app).post("/api/auth/forgot-password").send({ email: "a@example.com" })).status).toBe(429);
  });

  it("has limiters ready for reports, upvotes and comments", () => {
    for (const name of ["signup", "login", "otpVerify", "otpResend", "forgotPassword", "report", "upvote", "comment"]) {
      expect(DEFAULT_LIMITS[name].limit).toBeGreaterThan(0);
    }
  });
});
