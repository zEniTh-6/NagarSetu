import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { makeTestApp as createApp } from "./helpers/app.js";
import { prisma } from "../src/db/prisma.js";
import { seed } from "../src/seed/seed.js";
import { RESET_TTL_MS, LOCKOUT } from "../src/modules/auth/auth.service.js";
import { resetDb } from "./helpers/db.js";
import { makeUser, loginAgent, clearOutbox, lastEmailTo, resetTokenFrom, PASSWORD } from "./helpers/auth.js";

const app = createApp();

beforeEach(async () => {
  await resetDb(prisma);
  clearOutbox();
});
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

describe("forced password change (mustChangePassword)", () => {
  it("a seeded admin's first login is forced to change the password", async () => {
    const { createdAdmins } = await seed(prisma);
    const { email, password } = createdAdmins[0];
    const agent = request.agent(app);

    const login = await agent.post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);

    // Every other route is blocked until the password is changed…
    const blocked = await agent.post("/api/admin/contractors/similar").send({ name: "Patil" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    // …except "me" (so the web app knows to show the form) and change-password itself.
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    const oldCookieAgent = request.agent(app);
    await oldCookieAgent.post("/api/auth/login").send({ email, password }).expect(200);

    const changed = await agent.post("/api/auth/change-password").send({ currentPassword: password, newPassword: "New-Strong-Pass-7" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    // The same agent got a fresh cookie and can now use admin routes.
    expect((await agent.post("/api/admin/contractors/similar").send({ name: "Patil" })).status).toBe(200);
    // Sessions from before the change no longer work.
    expect((await oldCookieAgent.get("/api/auth/me")).status).toBe(401);
    // The old password no longer works; the new one does.
    expect((await request(app).post("/api/auth/login").send({ email, password })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email, password: "New-Strong-Pass-7" })).status).toBe(200);

    const audit = await prisma.auditLog.findMany({ where: { action: "PASSWORD_CHANGED" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].reason).toMatch(/initial password/);
  });

  it("needs the right current password and a different new password", async () => {
    const user = await makeUser(prisma);
    const agent = await loginAgent(app, user.email);
    const wrong = await agent.post("/api/auth/change-password").send({ currentPassword: "nope-nope-1", newPassword: "New-Strong-Pass-7" });
    expect(wrong.body.error.code).toBe("WRONG_CURRENT_PASSWORD");
    const same = await agent.post("/api/auth/change-password").send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.body.error.code).toBe("PASSWORD_UNCHANGED");
  });
});

describe("forgot / reset password", () => {
  const forgot = (email) => request(app).post("/api/auth/forgot-password").send({ email });

  it("answers the same whether or not the email exists", async () => {
    const user = await makeUser(prisma);
    const known = await forgot(user.email);
    const unknown = await forgot("nobody@example.com");
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(lastEmailTo(user.email)).toBeDefined();
    expect(lastEmailTo("nobody@example.com")).toBeUndefined();
  });

  it("does not email deactivated accounts", async () => {
    const user = await makeUser(prisma, { status: "DEACTIVATED" });
    expect((await forgot(user.email)).status).toBe(202);
    expect(lastEmailTo(user.email)).toBeUndefined();
  });

  it("the link resets the password once, ends old sessions and writes an audit row", async () => {
    const user = await makeUser(prisma);
    const oldSession = await loginAgent(app, user.email);
    await forgot(user.email);
    const token = resetTokenFrom(lastEmailTo(user.email));

    // Only the hash is stored.
    const stored = await prisma.passwordResetToken.findFirst();
    expect(stored.tokenHash).not.toBe(token);

    await request(app).post("/api/auth/reset-password").send({ token, newPassword: "Brand-New-Pass-8" }).expect(200);
    const again = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "Another-Pass-9" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("RESET_LINK_INVALID");

    expect((await oldSession.get("/api/auth/me")).status).toBe(401);
    await loginAgent(app, user.email, "Brand-New-Pass-8");
    expect(await prisma.auditLog.count({ where: { action: "PASSWORD_RESET", targetId: user.id } })).toBe(1);
  });

  it("an expired link is refused", async () => {
    const user = await makeUser(prisma);
    await forgot(user.email);
    const token = resetTokenFrom(lastEmailTo(user.email));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RESET_TTL_MS + 1000);
    const res = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "Brand-New-Pass-8" });
    expect(res.body.error.code).toBe("RESET_LINK_INVALID");
  });

  it("a newer link replaces the older one", async () => {
    const user = await makeUser(prisma);
    await forgot(user.email);
    const first = resetTokenFrom(lastEmailTo(user.email));
    await forgot(user.email);
    const second = resetTokenFrom(lastEmailTo(user.email));
    expect((await request(app).post("/api/auth/reset-password").send({ token: first, newPassword: "Brand-New-Pass-8" })).status).toBe(400);
    expect((await request(app).post("/api/auth/reset-password").send({ token: second, newPassword: "Brand-New-Pass-8" })).status).toBe(200);
  });

  it("resetting also lifts a lockout", async () => {
    const user = await makeUser(prisma);
    for (let i = 0; i < LOCKOUT.maxFailedAttempts; i++) {
      await request(app).post("/api/auth/login").send({ email: user.email, password: "Wrong-Password-1" });
    }
    await forgot(user.email);
    const token = resetTokenFrom(lastEmailTo(user.email));
    await request(app).post("/api/auth/reset-password").send({ token, newPassword: "Brand-New-Pass-8" }).expect(200);
    await loginAgent(app, user.email, "Brand-New-Pass-8");
  });

  it("a reset also clears mustChangePassword (the user chose the password)", async () => {
    const user = await makeUser(prisma, { mustChangePassword: true });
    await forgot(user.email);
    const token = resetTokenFrom(lastEmailTo(user.email));
    await request(app).post("/api/auth/reset-password").send({ token, newPassword: "Brand-New-Pass-8" }).expect(200);
    const agent = await loginAgent(app, user.email, "Brand-New-Pass-8");
    expect((await agent.get("/api/auth/me")).body.user.mustChangePassword).toBe(false);
  });
});
