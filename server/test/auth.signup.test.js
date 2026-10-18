import { describe, it, expect, beforeEach, afterAll, vi, afterEach } from "vitest";
import request from "supertest";
import { Router } from "express";
import { makeTestApp as createApp } from "./helpers/app.js";
import { prisma } from "../src/db/prisma.js";
import { requireAuth, requireVerified } from "../src/auth/middleware.js";
import { OTP } from "../src/modules/auth/auth.service.js";
import { resetDb } from "./helpers/db.js";
import { clearOutbox, lastEmailTo, otpFrom, sessionCookie, PASSWORD } from "./helpers/auth.js";

// A stand-in for the later "report" / "upvote" routes, which need a verified citizen.
const app = createApp({
  extraRoutes: ({ prisma }) => Router().post("/api/test/report", requireAuth(prisma), requireVerified, (_req, res) => res.json({ ok: true })),
});

beforeEach(async () => {
  await resetDb(prisma);
  clearOutbox();
});
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

const signupBody = (email = "asha@example.com") => ({ name: "Asha Patil", email, password: PASSWORD, phone: "+91 98765 43210" });

describe("signup", () => {
  it("creates an unverified CITIZEN, emails a 6-digit OTP and writes an audit row", async () => {
    const res = await request(app).post("/api/auth/signup").send(signupBody());
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: "CITIZEN", emailVerified: false, email: "asha@example.com" });
    expect(res.body.otpSent).toBe(true);
    expect(res.body.user.passwordHash).toBeUndefined();

    const mail = lastEmailTo("asha@example.com");
    expect(otpFrom(mail)).toMatch(/^\d{6}$/);

    // Only a hash of the code is stored.
    const otp = await prisma.otpCode.findFirst();
    expect(otp.codeHash).not.toContain(otpFrom(mail));

    const audit = await prisma.auditLog.findMany({ where: { action: "USER_CREATED" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ targetId: res.body.user.id, actorId: res.body.user.id });
  });

  it.each(["ADMIN", "CONTRACTOR"])("cannot sign up as %s (no such option)", async (role) => {
    const res = await request(app).post("/api/auth/signup").send({ ...signupBody(), role });
    expect(res.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("cannot pick a department either", async () => {
    const res = await request(app).post("/api/auth/signup").send({ ...signupBody(), departmentId: crypto.randomUUID() });
    expect(res.status).toBe(400);
  });

  it("stores the email in lower case and rejects a duplicate with 409 EMAIL_TAKEN", async () => {
    await request(app).post("/api/auth/signup").send(signupBody("Asha@Example.com")).expect(201);
    const res = await request(app).post("/api/auth/signup").send(signupBody("asha@example.COM"));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects weak or over-long passwords", async () => {
    expect((await request(app).post("/api/auth/signup").send({ ...signupBody(), password: "short" })).status).toBe(400);
    expect((await request(app).post("/api/auth/signup").send({ ...signupBody(), password: "ह".repeat(30) })).status).toBe(400);
  });

  it("does not log the citizen in (they log in like everyone else)", async () => {
    const res = await request(app).post("/api/auth/signup").send(signupBody());
    expect(sessionCookie(res)).toBeUndefined();
  });
});

describe("email OTP verification", () => {
  async function signedUpAgent(email = "asha@example.com") {
    await request(app).post("/api/auth/signup").send(signupBody(email)).expect(201);
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password: PASSWORD }).expect(200);
    return { agent, code: otpFrom(lastEmailTo(email)) };
  }

  it("unverified citizens can log in but cannot report or upvote", async () => {
    const { agent } = await signedUpAgent();
    expect((await agent.get("/api/auth/me")).body.user.emailVerified).toBe(false);
    const res = await agent.post("/api/test/report");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("the right code verifies the email, writes an audit row and unlocks reporting", async () => {
    const { agent, code } = await signedUpAgent();
    const res = await agent.post("/api/auth/verify-email").send({ code });
    expect(res.status).toBe(200);
    expect((await agent.get("/api/auth/me")).body.user.emailVerified).toBe(true);
    expect((await agent.post("/api/test/report")).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "EMAIL_VERIFIED" } })).toBe(1);
  });

  it("a used code cannot be used again", async () => {
    const { agent, code } = await signedUpAgent();
    await agent.post("/api/auth/verify-email").send({ code }).expect(200);
    const again = await agent.post("/api/auth/verify-email").send({ code });
    expect(again.body).toMatchObject({ verified: true, alreadyVerified: true });
  });

  it("a wrong code is rejected and counts down the attempts", async () => {
    const { agent, code } = await signedUpAgent();
    const wrong = code === "000000" ? "111111" : "000000";
    const res = await agent.post("/api/auth/verify-email").send({ code: wrong });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "OTP_INVALID", details: { attemptsLeft: OTP.maxAttempts - 1 } });
  });

  it(`after ${OTP.maxAttempts} wrong codes even the right one is refused`, async () => {
    const { agent, code } = await signedUpAgent();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP.maxAttempts; i++) await agent.post("/api/auth/verify-email").send({ code: wrong });
    const res = await agent.post("/api/auth/verify-email").send({ code });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OTP_TOO_MANY_ATTEMPTS");
  });

  it("an expired code is refused", async () => {
    const { agent, code } = await signedUpAgent();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + OTP.ttlMs + 1000);
    const res = await agent.post("/api/auth/verify-email").send({ code });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OTP_EXPIRED");
  });

  it("resend has a cooldown, and a new code replaces the old one", async () => {
    const { agent, code: first } = await signedUpAgent();
    const tooSoon = await agent.post("/api/auth/verify-email/resend");
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.code).toBe("OTP_COOLDOWN");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + OTP.resendCooldownMs + 1000);
    await agent.post("/api/auth/verify-email/resend").expect(200);
    const second = otpFrom(lastEmailTo("asha@example.com"));

    if (first !== second) {
      expect((await agent.post("/api/auth/verify-email").send({ code: first })).status).toBe(400);
    }
    expect((await agent.post("/api/auth/verify-email").send({ code: second })).status).toBe(200);
  });

  it("verification needs a session", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({ code: "123456" });
    expect(res.status).toBe(401);
  });
});
