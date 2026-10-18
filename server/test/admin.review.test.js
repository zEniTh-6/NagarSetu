import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { runIssueEmbedding } from "../src/modules/issues/duplicates.service.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp } from "./helpers/app.js";
import { makeUser, loginAgent } from "./helpers/auth.js";
import { citizenSetup, adminOf, SANGLI } from "./helpers/issues.js";
import { anotherCitizen, newReport, setAi, notificationsOf } from "./helpers/admin.js";
import { fakeEmbed } from "./helpers/embed.js";

let app, jobs, citizen, agent, roads, electrical;

beforeEach(async () => {
  await resetDb(prisma);
  jobs = createMemoryQueue();
  app = makeTestApp({ jobs });
  ({ citizen, agent } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
  electrical = await adminOf(prisma, app, "ELECTRICAL");
});
afterAll(() => prisma.$disconnect());

const act = (admin, issueId, action, body = {}) => admin.agent.post(`/api/admin/issues/${issueId}/${action}`).send(body);
const audits = (issueId, action) => prisma.auditLog.findMany({ where: { targetId: issueId, action }, orderBy: { id: "asc" } });

describe("accept", () => {
  it("REPORTED → ACKNOWLEDGED; audited; the reporter and supporters are told", async () => {
    const issue = await newReport(agent);
    const supporter = await anotherCitizen(prisma, app);
    await supporter.agent.post(`/api/issues/${issue.id}/support`).send({});

    const res = await act(roads, issue.id, "accept");
    expect(res.status).toBe(200);
    expect(res.body.issue).toMatchObject({ id: issue.id, status: "ACKNOWLEDGED" });
    expect(res.body.issue.acknowledgedAt).toBeTruthy();

    const [audit] = await audits(issue.id, "ISSUE_STATUS_CHANGED");
    expect(audit).toMatchObject({ actorId: roads.admin.id, actorRole: "ADMIN" });
    expect(audit.metadata).toMatchObject({ from: "REPORTED", to: "ACKNOWLEDGED" });
    for (const user of [citizen, supporter.user]) {
      expect((await notificationsOf(prisma, user.id)).map((n) => n.type)).toEqual(["ACKNOWLEDGED"]);
    }
    expect(await notificationsOf(prisma, roads.admin.id)).toHaveLength(0);
  });

  it("only from REPORTED: a second accept is refused", async () => {
    const issue = await newReport(agent);
    expect((await act(roads, issue.id, "accept")).status).toBe(200);
    const again = await act(roads, issue.id, "accept");
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("NOT_REPORTED");
  });

  it("two admins at once: one wins, the other gets 409 and nothing is written twice", async () => {
    const issue = await newReport(agent);
    const second = await adminOf(prisma, app, "CONSTRUCTION"); // backup admin of the same department
    const results = await Promise.all([act(roads, issue.id, "accept"), act(second, issue.id, "accept")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await audits(issue.id, "ISSUE_STATUS_CHANGED")).toHaveLength(1);
    expect(await notificationsOf(prisma, citizen.id)).toHaveLength(1);
  });
});

describe("final priority (AI risk is only the suggestion)", () => {
  it("admin sets a LOWER priority than suggested → allowed only with a reason, which is logged", async () => {
    const issue = await newReport(agent);
    await setAi(prisma, issue.id, { riskLevel: "HIGH" });

    const noReason = await act(roads, issue.id, "accept", { priority: "LOW" });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.code).toBe("PRIORITY_REASON_REQUIRED");
    expect((await prisma.issue.findUnique({ where: { id: issue.id } })).status).toBe("REPORTED"); // nothing half-done

    const res = await act(roads, issue.id, "accept", { priority: "LOW", priorityReason: "Side lane, hardly any traffic" });
    expect(res.status).toBe(200);
    expect(res.body.issue).toMatchObject({ status: "ACKNOWLEDGED", priority: "LOW", priorityReason: "Side lane, hardly any traffic" });
    const [audit] = await audits(issue.id, "ISSUE_PRIORITY_SET");
    expect(audit.reason).toBe("Side lane, hardly any traffic");
    expect(audit.metadata).toEqual({ from: null, to: "LOW", suggestion: "HIGH" });
  });

  it("same as the suggestion, or no suggestion yet → no reason needed; can be changed later", async () => {
    const a = await newReport(agent);
    await setAi(prisma, a.id, { riskLevel: "MEDIUM" });
    expect((await act(roads, a.id, "accept", { priority: "MEDIUM" })).status).toBe(200);

    const b = await newReport(agent); // AI hasn't answered yet
    expect((await act(roads, b.id, "priority", { priority: "CRITICAL" })).status).toBe(200);

    const raise = await act(roads, a.id, "priority", { priority: "HIGH" });
    expect(raise.status).toBe(400);
    const raised = await act(roads, a.id, "priority", { priority: "HIGH", reason: "Near the school gate" });
    expect(raised.body.issue.priority).toBe("HIGH");
    expect((await audits(a.id, "ISSUE_PRIORITY_SET")).map((x) => x.metadata.to)).toEqual(["MEDIUM", "HIGH"]);
  });

  it("not on closed issues", async () => {
    const issue = await newReport(agent);
    await act(roads, issue.id, "reject", { type: "NOT_VALID", reason: "Photo shows a private compound" });
    expect((await act(roads, issue.id, "priority", { priority: "LOW" })).status).toBe(409);
  });
});

describe("reject and forward (exits from REPORTED; the citizen is always told why)", () => {
  it("reject needs a reason; the citizen sees the reason and gets a notification", async () => {
    const issue = await newReport(agent);
    expect((await act(roads, issue.id, "reject", { type: "NOT_VALID" })).status).toBe(400);
    expect((await act(roads, issue.id, "reject", { type: "NOT_VALID", reason: " " })).status).toBe(400);

    const res = await act(roads, issue.id, "reject", { type: "NOT_VALID", reason: "Photo shows a private compound" });
    expect(res.status).toBe(200);
    expect(res.body.issue).toMatchObject({ status: "REJECTED", rejectionType: "NOT_VALID", statusReason: "Photo shows a private compound" });

    const mine = await agent.get(`/api/issues/${issue.id}`);
    expect(mine.body.issue).toMatchObject({ status: "REJECTED", rejectionType: "NOT_VALID", statusReason: "Photo shows a private compound" });
    const [n] = await notificationsOf(prisma, citizen.id);
    expect(n).toMatchObject({ type: "REJECTED", issueId: issue.id, params: { rejectionType: "NOT_VALID", reason: "Photo shows a private compound" } });
    const [audit] = await audits(issue.id, "ISSUE_STATUS_CHANGED");
    expect(audit.reason).toBe("Photo shows a private compound");
  });

  it("road outside municipal responsibility → 'forwarded', citizen told where", async () => {
    const issue = await newReport(agent);
    const reason = "State highway (NH-166), forwarded to PWD Sangli";
    const res = await act(roads, issue.id, "forward", { reason });
    expect(res.status).toBe(200);
    expect(res.body.issue).toMatchObject({ status: "REJECTED", rejectionType: "NOT_OUR_JURISDICTION", statusReason: reason });
    const [n] = await notificationsOf(prisma, citizen.id);
    expect(n.params).toEqual({ rejectionType: "NOT_OUR_JURISDICTION", reason });
  });

  it("the citizen can no longer withdraw once it has been reviewed", async () => {
    const issue = await newReport(agent);
    await act(roads, issue.id, "accept");
    expect((await agent.post(`/api/issues/${issue.id}/withdraw`).send({})).status).toBe(409);
  });
});

describe("link as duplicate (support still counts; nothing is deleted or merged automatically)", () => {
  it("moves the reporter, supporters and upvotes to the open issue; the citizen is told", async () => {
    const original = await newReport(agent);
    const second = await anotherCitizen(prisma, app);
    const dup = await newReport(second.agent, { description: "Same pothole again, gaddha bada ho gaya" });
    const fan = await anotherCitizen(prisma, app);
    await fan.agent.post(`/api/issues/${dup.id}/support`).send({});
    await prisma.upvote.createMany({ data: [{ issueId: dup.id, userId: fan.user.id }, { issueId: dup.id, userId: citizen.id }] });
    await act(roads, original.id, "accept");

    const res = await act(roads, dup.id, "link-duplicate", { targetIssueId: original.id, reason: "Same pothole" });
    expect(res.status).toBe(200);
    expect(res.body.issue).toMatchObject({ status: "DUPLICATE", duplicateOfId: original.id, statusReason: "Same pothole" });
    expect(res.body.issue.duplicateOf).toMatchObject({ id: original.id, status: "ACKNOWLEDGED" });

    const supporters = await prisma.issueSupporter.findMany({ where: { issueId: original.id } });
    expect(supporters.map((s) => s.userId).sort()).toEqual([second.user.id, fan.user.id].sort());
    expect(supporters.every((s) => s.source === "LINKED_BY_ADMIN")).toBe(true);
    // The original reporter's upvote on the duplicate isn't turned into "supporting their own issue".
    expect((await prisma.upvote.findMany({ where: { issueId: original.id } })).map((u) => u.userId)).toEqual([fan.user.id]);
    // Nothing deleted
    expect(await prisma.issueSupporter.count({ where: { issueId: dup.id } })).toBe(1);
    expect(await prisma.upvote.count({ where: { issueId: dup.id } })).toBe(2);

    const [audit] = await audits(dup.id, "ISSUE_LINKED_DUPLICATE");
    expect(audit.metadata).toMatchObject({ from: "REPORTED", to: "DUPLICATE", duplicateOfId: original.id, supportersAdded: 2 });
    expect((await notificationsOf(prisma, second.user.id)).map((n) => [n.type, n.params])).toEqual([
      ["LINKED_DUPLICATE", { duplicateOfId: original.id, reason: "Same pothole" }],
    ]);
    // The open issue now lists it
    const view = await roads.agent.get(`/api/issues/${original.id}`);
    expect(view.body.issue.linkedDuplicates.map((d) => d.id)).toEqual([dup.id]);
  });

  it("linking to an issue that is itself a duplicate links to the open one", async () => {
    const a = await newReport(agent);
    const b = await newReport(agent);
    const c = await newReport(agent);
    await act(roads, b.id, "link-duplicate", { targetIssueId: a.id });
    const res = await act(roads, c.id, "link-duplicate", { targetIssueId: b.id });
    expect(res.body.issue.duplicateOfId).toBe(a.id);
  });

  it("refused for: itself, a closed issue, another category, another department", async () => {
    const issue = await newReport(agent);
    expect((await act(roads, issue.id, "link-duplicate", { targetIssueId: issue.id })).status).toBe(400);

    const closed = await newReport(agent);
    await act(roads, closed.id, "reject", { type: "OTHER", reason: "Test report" });
    expect((await act(roads, issue.id, "link-duplicate", { targetIssueId: closed.id })).body.error.code).toBe("TARGET_NOT_ACTIVE");

    const light = await newReport(agent, { categoryKey: "STREETLIGHT", description: "Street light not working, batti band hai" });
    // Another department's issue answers 404, like a missing one.
    expect((await act(roads, issue.id, "link-duplicate", { targetIssueId: light.id })).status).toBe(404);

    // Same department, different category (a second roads-department category for the test).
    const dept = await prisma.department.findUnique({ where: { code: "CONSTRUCTION" } });
    const drains = await prisma.category.create({ data: { key: "DRAINS_TEST", name: "Drains", departmentId: dept.id } });
    const other = await newReport(agent);
    await prisma.issue.update({ where: { id: other.id }, data: { categoryId: drains.id } });
    const diff = await act(roads, issue.id, "link-duplicate", { targetIssueId: other.id });
    expect(diff.status).toBe(409);
    expect(diff.body.error.code).toBe("DIFFERENT_CATEGORY");

    expect((await prisma.issue.findUnique({ where: { id: issue.id } })).status).toBe("REPORTED");
  });
});

describe("reroute (citizen picked the wrong category)", () => {
  it("admin reroutes with a reason → new department owns it, citizen told, old admin loses access", async () => {
    const issue = await newReport(agent, { description: "Kachra pada hai near the bus stand" });
    await prisma.issueFlag.create({ data: { issueId: issue.id, type: "POSSIBLE_DUPLICATE", reason: "Possible duplicate of x (found automatically)" } });
    await setAi(prisma, issue.id);
    await act(roads, issue.id, "priority", { priority: "MEDIUM" });

    expect((await act(roads, issue.id, "reroute", { categoryKey: "GARBAGE" })).status).toBe(400); // reason required
    const res = await act(roads, issue.id, "reroute", { categoryKey: "GARBAGE", reason: "Photo shows garbage, not road damage" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ issueId: issue.id, category: { key: "GARBAGE" }, department: { code: "SOLID_WASTE" }, stillInYourDepartment: false });
    expect(res.body.issue).toBeUndefined(); // no longer theirs to see

    const row = await prisma.issue.findUnique({ where: { id: issue.id }, include: { category: true, department: true } });
    expect(row).toMatchObject({ status: "REPORTED", priority: null, category: { key: "GARBAGE" }, department: { code: "SOLID_WASTE" } });
    expect(await prisma.issueFlag.count({ where: { issueId: issue.id, clearedAt: null } })).toBe(0); // old-category duplicate flag

    expect((await roads.agent.get(`/api/issues/${issue.id}`)).status).toBe(404);
    const garbage = await adminOf(prisma, app, "SOLID_WASTE");
    const list = await garbage.agent.get("/api/admin/issues");
    expect(list.body.items.map((i) => i.id)).toEqual([issue.id]);

    const [audit] = await audits(issue.id, "ISSUE_REROUTED");
    expect(audit).toMatchObject({ actorId: roads.admin.id, reason: "Photo shows garbage, not road damage" });
    expect(audit.metadata).toMatchObject({ fromCategory: "ROADS", toCategory: "GARBAGE" });
    const [n] = await notificationsOf(prisma, citizen.id);
    expect(n).toMatchObject({ type: "REROUTED", params: { fromCategory: "ROADS", toCategory: "GARBAGE", reason: "Photo shows garbage, not road damage" } });
    expect(jobs.sent.at(-1)).toEqual({ name: "embed-issue", data: { issueId: issue.id, recheck: true } });
  });

  it("the duplicate check runs again in the new category with the stored embedding", async () => {
    const garbage = await newReport(agent, { categoryKey: "GARBAGE", description: "Garbage dump near the bus stand, kachra" });
    await runIssueEmbedding(prisma, { issueId: garbage.id }, { embed: fakeEmbed, model: "fake" });
    const wrong = await newReport(agent, { description: "Kachra everywhere near the bus stand" });
    await runIssueEmbedding(prisma, { issueId: wrong.id }, { embed: fakeEmbed, model: "fake" });
    expect(await prisma.issueFlag.count({ where: { issueId: wrong.id } })).toBe(0); // different category so far

    await act(roads, wrong.id, "reroute", { categoryKey: "GARBAGE", reason: "It is garbage" });
    let calls = 0;
    const counting = async (t) => (calls++, fakeEmbed(t));
    const result = await runIssueEmbedding(prisma, { issueId: wrong.id, recheck: true }, { embed: counting });
    expect(calls).toBe(0); // no new embedding call (no quota used)
    expect(result.candidates).toEqual([garbage.id]);
    const flag = await prisma.issueFlag.findFirst({ where: { issueId: wrong.id, clearedAt: null } });
    expect(flag.type).toBe("POSSIBLE_DUPLICATE");
    expect(flag.reason).toContain(garbage.id);
  });

  it("only while REPORTED, and not to the same or an unknown category", async () => {
    const issue = await newReport(agent);
    expect((await act(roads, issue.id, "reroute", { categoryKey: "ROADS", reason: "Same" })).body.error.code).toBe("SAME_CATEGORY");
    expect((await act(roads, issue.id, "reroute", { categoryKey: "PARKS", reason: "Nope" })).body.error.code).toBe("UNKNOWN_CATEGORY");
    await act(roads, issue.id, "accept");
    expect((await act(roads, issue.id, "reroute", { categoryKey: "GARBAGE", reason: "Too late" })).body.error.code).toBe("NOT_REPORTED");
  });
});

describe("flags: clear or confirm (reason recorded; a flag never blocks the workflow)", () => {
  const far = { deviceLat: SANGLI.lat + 0.02, deviceLng: SANGLI.lng, deviceAccuracyM: 10 }; // ~2 km off, good accuracy

  it("confirm keeps the flag active and marks it confirmed; clear removes it; both audited", async () => {
    const issue = await newReport(agent, far);
    const flag = await prisma.issueFlag.findFirst({ where: { issueId: issue.id, type: "SUSPICIOUS" } });

    expect((await act(roads, issue.id, `flags/${flag.id}/confirm`, {})).status).toBe(400); // reason required
    const confirmed = await act(roads, issue.id, `flags/${flag.id}/confirm`, { reason: "Pin is in another ward" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.issue.flags[0]).toMatchObject({ id: flag.id, type: "SUSPICIOUS", confirmed: { reason: "Pin is in another ward" } });
    expect((await act(roads, issue.id, `flags/${flag.id}/confirm`, { reason: "again" })).body.error.code).toBe("FLAG_ALREADY_CONFIRMED");

    // A confirmed flag doesn't block the workflow.
    expect((await act(roads, issue.id, "accept")).status).toBe(200);

    const cleared = await act(roads, issue.id, `flags/${flag.id}/clear`, { reason: "Citizen phoned, pin is right" });
    expect(cleared.body.issue.flags).toEqual([]);
    expect((await act(roads, issue.id, `flags/${flag.id}/clear`, { reason: "again" })).body.error.code).toBe("FLAG_ALREADY_CLEARED");
    expect((await audits(issue.id, "FLAG_CONFIRMED"))[0].reason).toBe("Pin is in another ward");
    expect((await audits(issue.id, "FLAG_CLEARED"))[0]).toMatchObject({ actorId: roads.admin.id, reason: "Citizen phoned, pin is right" });
    // Citizens never see internal flags.
    expect((await agent.get(`/api/issues/${issue.id}`)).body.issue.flags).toBeUndefined();
  });

  it("ESCALATED/DISPUTED have their own flows; another issue's flag answers 404", async () => {
    const issue = await newReport(agent, far);
    const other = await newReport(agent);
    const escalated = await prisma.issueFlag.create({ data: { issueId: issue.id, type: "ESCALATED", reason: "Deadline passed" } });
    expect((await act(roads, issue.id, `flags/${escalated.id}/clear`, { reason: "nope" })).body.error.code).toBe("FLAG_NOT_REVIEWABLE");
    const flag = await prisma.issueFlag.findFirst({ where: { issueId: issue.id, type: "SUSPICIOUS" } });
    expect((await act(roads, other.id, `flags/${flag.id}/clear`, { reason: "wrong issue" })).status).toBe(404);
  });
});

describe("who can do this (authorization on the server)", () => {
  const actions = [
    ["accept", {}],
    ["reject", { type: "NOT_VALID", reason: "Not valid" }],
    ["forward", { reason: "Forwarded elsewhere" }],
    ["reroute", { categoryKey: "STREETLIGHT", reason: "Wrong category" }],
    ["priority", { priority: "LOW" }],
  ];

  it("sanitation/electrical admin opening a roads issue by URL → 404 everywhere, nothing changes", async () => {
    const issue = await newReport(agent);
    expect((await electrical.agent.get(`/api/issues/${issue.id}`)).status).toBe(404);
    for (const [action, body] of actions) expect((await act(electrical, issue.id, action, body)).status).toBe(404);
    const target = await newReport(agent);
    expect((await act(electrical, issue.id, "link-duplicate", { targetIssueId: target.id })).status).toBe(404);
    expect((await electrical.agent.get("/api/admin/issues")).body.items).toEqual([]);
    expect((await prisma.issue.findUnique({ where: { id: issue.id } })).status).toBe("REPORTED");
    expect(await prisma.auditLog.count({ where: { targetId: issue.id, actorId: electrical.admin.id } })).toBe(0);
  });

  it("citizens and contractors get 403; signed-out users 401", async () => {
    const issue = await newReport(agent);
    const contractor = await makeUser(prisma, { role: "CONTRACTOR" });
    const cAgent = await loginAgent(app, contractor.email);
    for (const a of [agent, cAgent]) {
      expect((await a.get("/api/admin/issues")).status).toBe(403);
      expect((await a.get("/api/admin/dashboard")).status).toBe(403);
      expect((await a.post(`/api/admin/issues/${issue.id}/accept`).send({})).status).toBe(403);
    }
    expect((await request(app).get("/api/admin/issues")).status).toBe(401);
    expect((await request(app).post(`/api/admin/issues/${issue.id}/accept`).send({})).status).toBe(401);
  });

  it("an admin who still has to change the initial password can't review", async () => {
    const issue = await newReport(agent);
    const dept = await prisma.department.findUnique({ where: { code: "CONSTRUCTION" } });
    const fresh = await makeUser(prisma, { role: "ADMIN", departmentId: dept.id, mustChangePassword: true });
    const freshAgent = await loginAgent(app, fresh.email);
    const res = await freshAgent.post(`/api/admin/issues/${issue.id}/accept`).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});
