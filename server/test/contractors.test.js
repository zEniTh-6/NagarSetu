import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { makeTestApp as createApp } from "./helpers/app.js";
import { prisma } from "../src/db/prisma.js";
import { INVITE_TTL_MS } from "../src/modules/contractors/contractors.service.js";
import { resetDb } from "./helpers/db.js";
import { makeUser, makeDepartment, loginAgent, inviteTokenFrom, PASSWORD } from "./helpers/auth.js";

const app = createApp();
let admin, adminAgent;

beforeEach(async () => {
  await resetDb(prisma);
  const dept = await makeDepartment(prisma);
  admin = await makeUser(prisma, { role: "ADMIN", departmentId: dept.id });
  adminAgent = await loginAgent(app, admin.email);
});
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

const details = (over = {}) => ({
  name: "Patil Road Works",
  phone: "+91 98220 12345",
  email: "patil.works@example.com",
  workType: "roads",
  ...over,
});

async function createContractor(over) {
  const res = await adminAgent.post("/api/admin/contractors").send(details(over));
  expect(res.status).toBe(201);
  return res.body;
}

describe("who can reach admin contractor routes", () => {
  it("a citizen opening an admin route is denied", async () => {
    const citizen = await makeUser(prisma);
    const agent = await loginAgent(app, citizen.email);
    const res = await agent.post("/api/admin/contractors").send(details());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await prisma.user.count({ where: { role: "CONTRACTOR" } })).toBe(0);
  });

  it("a contractor is denied too, and anonymous users get 401", async () => {
    const c = await makeUser(prisma, { role: "CONTRACTOR" });
    const agent = await loginAgent(app, c.email);
    expect((await agent.post("/api/admin/contractors/similar").send({ name: "x y z" })).status).toBe(403);
    expect((await request(app).post("/api/admin/contractors/similar").send({ name: "x y z" })).status).toBe(401);
  });
});

describe("creating a contractor", () => {
  it("creates the account without a password, returns the invite link once and audits it", async () => {
    const body = await createContractor();
    expect(body.contractor).toMatchObject({ name: "Patil Road Works", workType: "roads", invitePending: true, licenceNumber: null });
    const token = inviteTokenFrom(body.inviteUrl);

    const row = await prisma.user.findUnique({ where: { id: body.contractor.id } });
    expect(row).toMatchObject({ role: "CONTRACTOR", passwordHash: null, createdById: admin.id, departmentId: null });
    const invite = await prisma.inviteToken.findFirst();
    expect(invite.tokenHash).not.toBe(token);

    const actions = (await prisma.auditLog.findMany({ where: { actorId: admin.id } })).map((a) => a.action).sort();
    expect(actions).toEqual(["INVITE_CREATED", "USER_CREATED"]);
  });

  it("work type and licence are optional; name, phone and email are required", async () => {
    await createContractor({ workType: undefined, email: "a@example.com", name: "Alpha Electricals", phone: "9000000001" });
    for (const missing of ["name", "phone", "email"]) {
      const body = details({ email: "b@example.com", name: "Beta Builders", phone: "9000000002" });
      delete body[missing];
      const res = await adminAgent.post("/api/admin/contractors").send(body);
      expect(res.status).toBe(400);
    }
  });

  it("warns about similar contractors (phone, licence, name) and only creates after confirmation", async () => {
    await createContractor({ licenceNumber: "MH-PWD-2291" });

    const checks = [
      [{ name: "Something Else", phone: "098220 12345", email: "x1@example.com" }, "PHONE"],
      [{ name: "Something Else", phone: "9111111111", email: "x2@example.com", licenceNumber: "mh pwd 2291" }, "LICENCE"],
      [{ name: "patil road works pvt", phone: "9222222222", email: "x3@example.com" }, "NAME"],
    ];
    for (const [over, reason] of checks) {
      const res = await adminAgent.post("/api/admin/contractors").send(details(over));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SIMILAR_CONTRACTORS");
      expect(res.body.error.details.similar[0].matchedOn).toContain(reason);
    }

    const similar = await adminAgent.post("/api/admin/contractors/similar").send({ name: "PATIL ROAD WORKS" });
    expect(similar.body.similar).toHaveLength(1);

    const confirmed = await adminAgent.post("/api/admin/contractors").send(details({ ...checks[0][0], confirmSimilar: true }));
    expect(confirmed.status).toBe(201);
    const audit = await prisma.auditLog.findFirst({ where: { targetId: confirmed.body.contractor.id, action: "USER_CREATED" } });
    expect(audit.reason).toMatch(/similar/i);
  });

  it("two admins creating the same contractor get the warning", async () => {
    await createContractor();
    const dept2 = await makeDepartment(prisma);
    const admin2 = await makeUser(prisma, { role: "ADMIN", departmentId: dept2.id });
    const agent2 = await loginAgent(app, admin2.email);
    const res = await agent2.post("/api/admin/contractors").send(details({ email: "other@example.com" }));
    expect(res.body.error.code).toBe("SIMILAR_CONTRACTORS");
  });

  it("an email already in use is refused", async () => {
    await createContractor();
    const res = await adminAgent.post("/api/admin/contractors").send(details({ name: "Different Co", phone: "9333333333" }));
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });
});

describe("invite link", () => {
  it("can be checked without using it up, then accepted once; opening it twice fails", async () => {
    const { inviteUrl, contractor } = await createContractor();
    const token = inviteTokenFrom(inviteUrl);

    // Checking (e.g. a chat app building a preview) does not use the link.
    expect((await request(app).get(`/api/invites/${token}`)).body.invite).toMatchObject({ name: "Patil Road Works" });
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(200);

    const accept = await request(app).post(`/api/invites/${token}/accept`).send({ password: "Contractor-Pass-1" });
    expect(accept.status).toBe(200);
    expect(accept.body.user.role).toBe("CONTRACTOR");

    const reopen = await request(app).get(`/api/invites/${token}`);
    expect(reopen.status).toBe(410);
    expect(reopen.body.error.code).toBe("INVITE_USED");
    const reaccept = await request(app).post(`/api/invites/${token}/accept`).send({ password: "Hijack-Pass-123" });
    expect(reaccept.status).toBe(410);

    // The contractor logs in with the password they chose, not the hijack attempt.
    await loginAgent(app, contractor.email, "Contractor-Pass-1");
    expect(await prisma.auditLog.count({ where: { action: "INVITE_ACCEPTED" } })).toBe(1);
  });

  it("two accepts at the same moment: exactly one wins", async () => {
    const { inviteUrl } = await createContractor();
    const token = inviteTokenFrom(inviteUrl);
    const results = await Promise.all(
      ["Pass-One-111", "Pass-Two-222"].map((password) => request(app).post(`/api/invites/${token}/accept`).send({ password })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
  });

  it("expires", async () => {
    const { inviteUrl } = await createContractor();
    const token = inviteTokenFrom(inviteUrl);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + INVITE_TTL_MS + 1000);
    const res = await request(app).post(`/api/invites/${token}/accept`).send({ password: "Contractor-Pass-1" });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("INVITE_EXPIRED");
  });

  it("re-issuing gives a new link and revokes the old one", async () => {
    const { inviteUrl, contractor } = await createContractor();
    const old = inviteTokenFrom(inviteUrl);
    const res = await adminAgent.post(`/api/admin/contractors/${contractor.id}/invite`);
    expect(res.status).toBe(200);
    const fresh = inviteTokenFrom(res.body.inviteUrl);
    expect((await request(app).get(`/api/invites/${old}`)).status).toBe(410);
    expect((await request(app).get(`/api/invites/${fresh}`)).status).toBe(200);
  });

  it("an unknown or malformed token is refused", async () => {
    expect((await request(app).get(`/api/invites/${"A".repeat(43)}`)).status).toBe(404);
    expect((await request(app).get("/api/invites/short")).status).toBe(400);
  });
});

describe("deactivating a contractor", () => {
  async function activeContractor() {
    const { inviteUrl, contractor } = await createContractor();
    await request(app).post(`/api/invites/${inviteTokenFrom(inviteUrl)}/accept`).send({ password: PASSWORD }).expect(200);
    return contractor;
  }

  it("any admin can deactivate with a reason; the contractor is then blocked at login", async () => {
    const contractor = await activeContractor();
    const dept2 = await makeDepartment(prisma);
    const otherAdmin = await makeUser(prisma, { role: "ADMIN", departmentId: dept2.id });
    const otherAgent = await loginAgent(app, otherAdmin.email);

    const noReason = await otherAgent.post(`/api/admin/contractors/${contractor.id}/deactivate`).send({});
    expect(noReason.status).toBe(400);

    const res = await otherAgent.post(`/api/admin/contractors/${contractor.id}/deactivate`).send({ reason: "Fake licence reported" });
    expect(res.status).toBe(200);
    expect(res.body.contractor.status).toBe("DEACTIVATED");

    const login = await request(app).post("/api/auth/login").send({ email: contractor.email, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ACCOUNT_DEACTIVATED");

    const audit = await prisma.auditLog.findFirst({ where: { action: "USER_DEACTIVATED", targetId: contractor.id } });
    expect(audit).toMatchObject({ actorId: otherAdmin.id, reason: "Fake licence reported" });
    // Never deleted.
    expect(await prisma.user.count({ where: { id: contractor.id } })).toBe(1);
  });

  it("only contractors can be deactivated here", async () => {
    const citizen = await makeUser(prisma);
    const res = await adminAgent.post(`/api/admin/contractors/${citizen.id}/deactivate`).send({ reason: "test reason" });
    expect(res.status).toBe(404);
  });

  it("a pending invite stops working after deactivation", async () => {
    const { inviteUrl, contractor } = await createContractor();
    await adminAgent.post(`/api/admin/contractors/${contractor.id}/deactivate`).send({ reason: "Created by mistake" }).expect(200);
    expect((await request(app).get(`/api/invites/${inviteTokenFrom(inviteUrl)}`)).status).toBe(410);
  });
});
