import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { makeTestApp as createApp } from "./helpers/app.js";
import { prisma } from "../src/db/prisma.js";
import { LOCKOUT } from "../src/modules/auth/auth.service.js";
import { SESSION_TTL_MS } from "../src/auth/tokens.js";
import { resetDb } from "./helpers/db.js";
import { makeUser, makeDepartment, loginAgent, sessionCookie, PASSWORD } from "./helpers/auth.js";

const app = createApp();

beforeEach(() => resetDb(prisma));
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

const login = (email, password = PASSWORD) => request(app).post("/api/auth/login").send({ email, password });

describe("one login for all roles", () => {
  it.each(["CITIZEN", "CONTRACTOR", "ADMIN"])("%s logs in; the role comes from the account", async (role) => {
    const dept = role === "ADMIN" ? await makeDepartment(prisma) : null;
    const user = await makeUser(prisma, { role, departmentId: dept?.id });
    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(role);
    expect(res.body.token).toBeUndefined(); // token only travels in the httpOnly cookie
  });

  it("ignores any role sent by the client", async () => {
    const user = await makeUser(prisma);
    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: PASSWORD, role: "ADMIN" });
    expect(res.status).toBe(400);
  });

  it("sets an httpOnly, SameSite=Strict session cookie", async () => {
    const user = await makeUser(prisma);
    const cookie = sessionCookie(await login(user.email));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api/);
  });

  it("logs in with any letter case in the email", async () => {
    const user = await makeUser(prisma);
    expect((await login(user.email.toUpperCase())).status).toBe(200);
  });
});

describe("generic error for wrong credentials", () => {
  it("unknown email and wrong password give the identical answer", async () => {
    const user = await makeUser(prisma);
    const a = await login("nobody@example.com");
    const b = await login(user.email, "Wrong-Password-1");
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.error).toEqual({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
  });

  it("an invited contractor without a password yet gets the same answer", async () => {
    const c = await makeUser(prisma, { role: "CONTRACTOR", password: null });
    expect((await login(c.email, "anything-at-all")).body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("lockout after repeated wrong passwords", () => {
  it(`locks after ${LOCKOUT.maxFailedAttempts} wrong passwords; even the right one is refused while locked`, async () => {
    const user = await makeUser(prisma);
    for (let i = 0; i < LOCKOUT.maxFailedAttempts; i++) {
      expect((await login(user.email, "Wrong-Password-1")).status).toBe(401);
    }
    const locked = await login(user.email);
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
    expect(locked.body.error.details.retryAfterMinutes).toBeGreaterThan(0);

    // A wrong password while locked still looks like any wrong password (nothing leaks).
    expect((await login(user.email, "Wrong-Password-1")).body.error.code).toBe("INVALID_CREDENTIALS");

    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row.status).toBe("LOCKED");
    expect(await prisma.auditLog.count({ where: { action: "USER_LOCKED", targetId: user.id } })).toBe(1);
  });

  it("unlocks by itself after the lock period", async () => {
    const user = await makeUser(prisma);
    for (let i = 0; i < LOCKOUT.maxFailedAttempts; i++) await login(user.email, "Wrong-Password-1");
    expect((await login(user.email)).status).toBe(423);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + LOCKOUT.durationMs + 1000);
    expect((await login(user.email)).status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: user.id } })).status).toBe("ACTIVE");
    expect(await prisma.auditLog.count({ where: { action: "USER_UNLOCKED" } })).toBe(1);
  });

  it("a successful login resets the failure count", async () => {
    const user = await makeUser(prisma);
    for (let i = 0; i < LOCKOUT.maxFailedAttempts - 1; i++) await login(user.email, "Wrong-Password-1");
    await login(user.email).expect(200);
    for (let i = 0; i < LOCKOUT.maxFailedAttempts - 1; i++) await login(user.email, "Wrong-Password-1");
    expect((await login(user.email)).status).toBe(200);
  });
});

describe("deactivated accounts", () => {
  it("a deactivated contractor gets a clear blocked message, but only with the right password", async () => {
    const c = await makeUser(prisma, { role: "CONTRACTOR", status: "DEACTIVATED" });
    const right = await login(c.email);
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe("ACCOUNT_DEACTIVATED");

    const wrong = await login(c.email, "Wrong-Password-1");
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("deactivation ends an existing session immediately", async () => {
    const c = await makeUser(prisma, { role: "CONTRACTOR" });
    const agent = await loginAgent(app, c.email);
    await agent.get("/api/auth/me").expect(200);
    await prisma.user.update({ where: { id: c.id }, data: { status: "DEACTIVATED" } });
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DEACTIVATED");
  });
});

describe("JWT session", () => {
  it("admin sessions are shorter than citizen and contractor sessions", async () => {
    const dept = await makeDepartment(prisma);
    const admin = await makeUser(prisma, { role: "ADMIN", departmentId: dept.id });
    const citizen = await makeUser(prisma);
    const a = await login(admin.email);
    const c = await login(citizen.email);
    expect(a.body.expiresInSeconds).toBe(SESSION_TTL_MS.ADMIN / 1000);
    expect(c.body.expiresInSeconds).toBe(SESSION_TTL_MS.CITIZEN / 1000);
    expect(SESSION_TTL_MS.ADMIN).toBeLessThan(SESSION_TTL_MS.CITIZEN);

    const token = sessionCookie(a).split(";")[0].split("=")[1];
    const { iat, exp } = jwt.decode(token);
    expect(exp - iat).toBe(SESSION_TTL_MS.ADMIN / 1000);
  });

  it("an expired session is rejected", async () => {
    const dept = await makeDepartment(prisma);
    const admin = await makeUser(prisma, { role: "ADMIN", departmentId: dept.id });
    const agent = await loginAgent(app, admin.email);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + SESSION_TTL_MS.ADMIN + 1000);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("a tampered or forged token is rejected", async () => {
    const user = await makeUser(prisma);
    const forged = jwt.sign({ role: "ADMIN", pwd: 0 }, "not-the-server-secret-0123456789abcdef", { subject: user.id });
    const res = await request(app).get("/api/auth/me").set("Cookie", `nagarsetu_session=${forged}`);
    expect(res.status).toBe(401);

    const none = jwt.sign({ role: "ADMIN", pwd: 0 }, null, { algorithm: "none", subject: user.id });
    expect((await request(app).get("/api/auth/me").set("Cookie", `nagarsetu_session=${none}`)).status).toBe(401);
  });

  it("no cookie → 401", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
  });

  it("logout clears the cookie", async () => {
    const user = await makeUser(prisma);
    const agent = await loginAgent(app, user.email);
    await agent.post("/api/auth/logout").expect(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});
