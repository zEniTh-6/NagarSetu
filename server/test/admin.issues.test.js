import { describe, it, expect, beforeEach, afterAll } from "vitest";
import crypto from "node:crypto";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { communitySignals, isLowDiversity, DAY_MS } from "../src/modules/admin/community.js";
import { runIssueEmbedding } from "../src/modules/issues/duplicates.service.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp } from "./helpers/app.js";
import { citizenSetup, adminOf, report } from "./helpers/issues.js";
import { anotherCitizen, newReport, setAi } from "./helpers/admin.js";
import { fakeEmbed } from "./helpers/embed.js";

let app, citizen, agent, roads;

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp({ jobs: createMemoryQueue() });
  ({ citizen, agent } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
});
afterAll(() => prisma.$disconnect());

const act = (issueId, action, body = {}) => roads.agent.post(`/api/admin/issues/${issueId}/${action}`).send(body);

/** n citizen accounts created `ageDays` ago, upvoting the issue. */
async function upvoters(issueId, n, ageDays) {
  const createdAt = new Date(Date.now() - ageDays * DAY_MS);
  const users = Array.from({ length: n }, () => ({
    id: crypto.randomUUID(),
    email: `voter-${crypto.randomUUID()}@test.local`,
    name: "Voter",
    role: "CITIZEN",
    emailVerified: true,
    createdAt,
  }));
  await prisma.user.createMany({ data: users });
  await prisma.upvote.createMany({ data: users.map((u) => ({ issueId, userId: u.id })) });
  return users;
}

describe("issues table", () => {
  it("default = waiting for review (REPORTED), own department only, newest first, with the columns the admin needs", async () => {
    const older = await newReport(agent, { addressText: "Station Road" });
    const newer = await newReport(agent);
    await setAi(prisma, newer.id, { riskLevel: "HIGH" });
    const accepted = await newReport(agent);
    await act(accepted.id, "accept");
    await newReport(agent, { categoryKey: "STREETLIGHT", description: "Street light not working, batti band" });

    const res = await roads.agent.get("/api/admin/issues");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((i) => i.id)).toEqual([newer.id, older.id]);
    const row = res.body.items[0];
    expect(row).toMatchObject({
      status: "REPORTED",
      category: { key: "ROADS" },
      ai: { verdict: "VALID", riskLevel: "HIGH" },
      priority: null,
      community: { upvotes: 0, supporters: 0, accounts: 0, newAccounts: 0, lowDiversity: false },
      flags: [],
    });
    expect(row.photo.url).toMatch(/^\/api\/photos\//);
    expect(row.location).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(res.body.items[1].addressText).toBe("Station Road");
  });

  it("filters by status, flag and priority; sorts by AI risk and by community support; pages", async () => {
    const low = await newReport(agent);
    const high = await newReport(agent);
    const none = await newReport(agent, { deviceLat: 16.88, deviceLng: 74.5815, deviceAccuracyM: 10 }); // SUSPICIOUS
    await setAi(prisma, low.id, { riskLevel: "LOW" });
    await setAi(prisma, high.id, { riskLevel: "CRITICAL" });
    await act(high.id, "accept", { priority: "CRITICAL" });
    await upvoters(low.id, 3, 100);

    const ids = async (q) => (await roads.agent.get(`/api/admin/issues?${q}`)).body.items.map((i) => i.id);
    expect(await ids("status=ACTIVE&sort=risk")).toEqual([high.id, low.id, none.id]); // no AI result last
    expect(await ids("status=ACKNOWLEDGED")).toEqual([high.id]);
    expect(await ids("status=ALL&flag=SUSPICIOUS")).toEqual([none.id]);
    expect(await ids("status=ACTIVE&priority=NONE&sort=oldest")).toEqual([low.id, none.id]);
    expect((await ids("status=ACTIVE&sort=support"))[0]).toBe(low.id);

    const page2 = await roads.agent.get("/api/admin/issues?status=ACTIVE&pageSize=2&page=2&sort=oldest");
    expect(page2.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page2.body.items.map((i) => i.id)).toEqual([none.id]);

    expect((await roads.agent.get("/api/admin/issues?status=OPEN")).status).toBe(400);
    expect((await roads.agent.get("/api/admin/issues?departmentId=x")).status).toBe(400); // can't widen the scope
  });

  it("dashboard counts for the department", async () => {
    const a = await newReport(agent);
    const b = await newReport(agent, { deviceLat: 16.88, deviceLng: 74.5815, deviceAccuracyM: 10 });
    await newReport(agent);
    await act(a.id, "accept");
    await act(b.id, "reject", { type: "OTHER", reason: "Test report" });
    await newReport(agent, { categoryKey: "GARBAGE", description: "Kachra near the market" }); // other department

    const res = await roads.agent.get("/api/admin/dashboard");
    expect(res.body).toEqual({
      waitingForReview: 1,
      needsPriority: 1,
      byStatus: { REPORTED: 1, ACKNOWLEDGED: 1, REJECTED: 1 },
      activeFlags: {}, // b's SUSPICIOUS flag no longer counts: b is closed
    });
  });
});

describe("community signal (separate from the AI risk; upvotes ≠ severity)", () => {
  it("200 upvotes from accounts created today → admin sees low supporter diversity", async () => {
    const issue = await newReport(agent);
    await upvoters(issue.id, 200, 0);
    const res = await roads.agent.get(`/api/issues/${issue.id}`);
    expect(res.body.issue.community).toEqual({ upvotes: 200, supporters: 0, accounts: 200, newAccounts: 200, lowDiversity: true });
  });

  it("established accounts → no warning; too few to judge → no warning", async () => {
    const real = await newReport(agent);
    await upvoters(real.id, 37, 90);
    await upvoters(real.id, 3, 1);
    const few = await newReport(agent);
    await upvoters(few.id, 4, 0);

    const signals = await communitySignals(prisma, [real.id, few.id]);
    expect(signals[real.id]).toMatchObject({ accounts: 40, newAccounts: 3, lowDiversity: false });
    expect(signals[few.id]).toMatchObject({ accounts: 4, newAccounts: 4, lowDiversity: false });
  });

  it("counts distinct accounts (upvote + support by the same person = 1), never the reporter", async () => {
    const issue = await newReport(agent);
    const fan = await anotherCitizen(prisma, app);
    await fan.agent.post(`/api/issues/${issue.id}/support`).send({});
    await prisma.upvote.createMany({ data: [{ issueId: issue.id, userId: fan.user.id }, { issueId: issue.id, userId: citizen.id }] });
    const signals = await communitySignals(prisma, [issue.id]);
    expect(signals[issue.id]).toMatchObject({ upvotes: 2, supporters: 1, accounts: 1 });
  });

  it("the rule's edges: at least 5 accounts and at least half of them new", () => {
    const rule = { minAccounts: 5, newShare: 0.5, newAccountDays: 7 };
    expect(isLowDiversity({ accounts: 5, newAccounts: 3 }, rule)).toBe(true);
    expect(isLowDiversity({ accounts: 10, newAccounts: 5 }, rule)).toBe(true);
    expect(isLowDiversity({ accounts: 10, newAccounts: 4 }, rule)).toBe(false);
    expect(isLowDiversity({ accounts: 4, newAccounts: 4 }, rule)).toBe(false);
    expect(isLowDiversity({ accounts: 0, newAccounts: 0 }, rule)).toBe(false);
  });
});

describe("review screen", () => {
  it("shows the possible duplicates (with distance), and the issue's history from the audit log", async () => {
    const first = await newReport(agent);
    await runIssueEmbedding(prisma, { issueId: first.id }, { embed: fakeEmbed, model: "fake" });
    const second = (await report(agent, { duplicateCandidateIds: first.id })).body.issue;
    await act(second.id, "priority", { priority: "LOW" });

    const { body } = await roads.agent.get(`/api/issues/${second.id}`);
    expect(body.issue.flags.map((f) => f.type)).toEqual(["POSSIBLE_DUPLICATE"]);
    expect(body.issue.possibleDuplicates).toEqual([
      { id: first.id, status: "REPORTED", category: "ROADS", description: expect.any(String), createdAt: expect.any(String), distanceM: 0 },
    ]);
    expect(body.issue.duplicateOf).toBeNull();
    expect(body.issue.history.map((h) => h.action)).toEqual(["ISSUE_CREATED", "FLAG_ADDED", "ISSUE_PRIORITY_SET"]);
    expect(body.issue.history[0].by).toEqual({ id: citizen.id, name: citizen.name, role: "CITIZEN" });
    expect(body.issue.history[2].by.role).toBe("ADMIN");
  });

  it("possible duplicates outside the department are left out, not leaked", async () => {
    const light = await newReport(agent, { categoryKey: "STREETLIGHT", description: "Batti band hai" });
    const issue = await newReport(agent);
    await prisma.issueFlag.create({ data: { issueId: issue.id, type: "POSSIBLE_DUPLICATE", reason: `Possible duplicate of ${light.id} (found automatically)` } });
    const { body } = await roads.agent.get(`/api/issues/${issue.id}`);
    expect(body.issue.possibleDuplicates).toEqual([]);
  });
});
