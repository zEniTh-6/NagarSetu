// Phase 7b: upvotes, comments, comment reports, hiding comments, official replies (D-025).
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { makeUser, loginAgent } from "./helpers/auth.js";
import { citizenSetup, adminOf } from "./helpers/issues.js";
import { newReport, setAi, anotherCitizen, notificationsOf } from "./helpers/admin.js";

let app, agent, citizen, roads, fan;

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp({ jobs: createMemoryQueue(), storage: tempStorage() });
  ({ agent, citizen } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
  fan = await anotherCitizen(prisma, app);
});
afterAll(() => prisma.$disconnect());

const publicReport = async (fields) => {
  const issue = await newReport(agent, fields);
  await setAi(prisma, issue.id, { verdict: "VALID" });
  return issue;
};
const comment = (a, issueId, body = "Same here, my scooter slipped") => a.post(`/api/issues/${issueId}/comments`).send({ body });
const commentsOf = async (a, issueId) => (await a.get(`/api/issues/${issueId}/comments`)).body;

describe("upvotes", () => {
  it("one per account; a second press is a no-op; removing works and is idempotent", async () => {
    const issue = await publicReport();
    const first = await fan.agent.post(`/api/issues/${issue.id}/upvote`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ issueId: issue.id, upvoted: true, alreadyUpvoted: false, upvotes: 1 });
    expect((await fan.agent.post(`/api/issues/${issue.id}/upvote`)).body).toMatchObject({ alreadyUpvoted: true, upvotes: 1 });
    expect((await fan.agent.get("/api/feed")).body.items[0]).toMatchObject({ community: { upvotes: 1 }, viewer: { upvoted: true } });

    expect((await fan.agent.delete(`/api/issues/${issue.id}/upvote`)).body).toEqual({ issueId: issue.id, upvoted: false, upvotes: 0 });
    expect((await fan.agent.delete(`/api/issues/${issue.id}/upvote`)).body.upvotes).toBe(0);
  });

  it("verified citizens only, never on your own report, only on open public issues", async () => {
    const issue = await publicReport();
    const unverified = await loginAgent(app, (await makeUser(prisma, { role: "CITIZEN" })).email);
    expect((await unverified.post(`/api/issues/${issue.id}/upvote`)).status).toBe(403);
    expect((await roads.agent.post(`/api/issues/${issue.id}/upvote`)).status).toBe(403);
    expect((await agent.post(`/api/issues/${issue.id}/upvote`)).body.error.code).toBe("OWN_ISSUE");

    const hidden = await newReport(agent, { description: "not public yet" });
    expect((await fan.agent.post(`/api/issues/${hidden.id}/upvote`)).status).toBe(404);
    await fan.agent.post(`/api/issues/${hidden.id}/support`).send({});
    expect((await fan.agent.post(`/api/issues/${hidden.id}/upvote`)).body.error.code).toBe("ISSUE_NOT_PUBLIC");

    await fan.agent.post(`/api/issues/${issue.id}/upvote`);
    await prisma.issue.update({ where: { id: issue.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    const other = await anotherCitizen(prisma, app);
    expect((await other.agent.post(`/api/issues/${issue.id}/upvote`)).body.error.code).toBe("ISSUE_NOT_ACTIVE");
    expect((await fan.agent.delete(`/api/issues/${issue.id}/upvote`)).status).toBe(200); // removing still works
  });

  it("triggers nothing: no notification, no audit row, no status or priority change", async () => {
    const issue = await publicReport();
    await fan.agent.post(`/api/issues/${issue.id}/upvote`);
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { targetId: issue.id, NOT: { action: "ISSUE_CREATED" } } })).toBe(0);
    expect(await prisma.issue.findUnique({ where: { id: issue.id } })).toMatchObject({ status: "REPORTED", priority: null });
  });

  it("is rate limited", async () => {
    const limited = makeTestApp({ rateLimits: { upvote: { limit: 2 } } });
    const a = await loginAgent(limited, fan.user.email);
    const issue = await publicReport();
    expect((await a.post(`/api/issues/${issue.id}/upvote`)).status).toBe(200);
    expect((await a.delete(`/api/issues/${issue.id}/upvote`)).status).toBe(200);
    expect((await a.post(`/api/issues/${issue.id}/upvote`)).status).toBe(429);
  });

  it("the admin sees upvotes, distinct supporters and how many backers are newer than 7 days", async () => {
    const issue = await publicReport();
    const old = await makeUser(prisma, { role: "CITIZEN", emailVerified: true, createdAt: new Date(Date.now() - 30 * 86_400_000) });
    const oldAgent = await loginAgent(app, old.email);
    await fan.agent.post(`/api/issues/${issue.id}/upvote`);
    await fan.agent.post(`/api/issues/${issue.id}/support`).send({}); // same person: one backer
    await oldAgent.post(`/api/issues/${issue.id}/upvote`);
    const res = await roads.agent.get(`/api/issues/${issue.id}`);
    expect(res.body.issue.community).toEqual({ upvotes: 2, supporters: 1, accounts: 2, newAccounts: 1, newAccountDays: 7, lowDiversity: false });
  });
});

describe("comments", () => {
  it("verified citizens comment on public issues; stored as written; first name only; newest first", async () => {
    await prisma.user.update({ where: { id: fan.user.id }, data: { name: "Asha Vinod Patil" } });
    const issue = await publicReport();
    const body = "  रस्त्यावर मोठा खड्डा, road pe gaddha hai  ";
    const res = await comment(fan.agent, issue.id, body);
    expect(res.status).toBe(201);
    expect(res.body.comment).toMatchObject({ body, official: false, author: { firstName: "Asha" }, mine: true, reportedByMe: false });
    await comment(agent, issue.id, "Thanks, I reported it");

    const list = await commentsOf(fan.agent, issue.id);
    expect(list.total).toBe(2);
    expect(list.items.map((c) => c.body)).toEqual(["Thanks, I reported it", body]);
    expect(list.items.map((c) => c.mine)).toEqual([false, true]);
    const json = JSON.stringify(list);
    for (const leak of ["Patil", "Vinod", fan.user.id, citizen.id, fan.user.email]) expect(json).not.toContain(leak);
    expect((await fan.agent.get("/api/feed")).body.items[0].community.comments).toBe(2);
  });

  it("not on issues that aren't public; blank, too long and unverified are refused", async () => {
    const hidden = await newReport(agent);
    expect((await comment(fan.agent, hidden.id)).status).toBe(404);
    expect((await fan.agent.get(`/api/issues/${hidden.id}/comments`)).status).toBe(404);
    expect((await comment(agent, hidden.id)).body.error.code).toBe("ISSUE_NOT_PUBLIC");

    const issue = await publicReport();
    expect((await comment(fan.agent, issue.id, "   ")).status).toBe(400);
    expect((await comment(fan.agent, issue.id, "x".repeat(1001))).status).toBe(400);
    const unverified = await loginAgent(app, (await makeUser(prisma, { role: "CITIZEN" })).email);
    expect((await comment(unverified, issue.id)).status).toBe(403);
    expect((await unverified.get(`/api/issues/${issue.id}/comments`)).status).toBe(200); // reading is fine
  });

  it("is rate limited", async () => {
    const limited = makeTestApp({ rateLimits: { comment: { limit: 1 } } });
    const a = await loginAgent(limited, fan.user.email);
    const issue = await publicReport();
    expect((await comment(a, issue.id)).status).toBe(201);
    expect((await comment(a, issue.id)).status).toBe(429);
  });
});

describe("reporting a comment", () => {
  it("one report per person; shows as reported to them; not your own", async () => {
    const issue = await publicReport();
    const c = (await comment(agent, issue.id, "buy cheap phones at example dot com")).body.comment;
    const res = await fan.agent.post(`/api/comments/${c.id}/report`).send({ reason: "SPAM", note: "advert" });
    expect(res.body).toEqual({ commentId: c.id, reported: true, alreadyReported: false });
    expect((await fan.agent.post(`/api/comments/${c.id}/report`).send({ reason: "ABUSIVE" })).body.alreadyReported).toBe(true);
    expect(await prisma.commentReport.count()).toBe(1);
    expect((await commentsOf(fan.agent, issue.id)).items[0].reportedByMe).toBe(true);

    expect((await agent.post(`/api/comments/${c.id}/report`).send({ reason: "SPAM" })).body.error.code).toBe("OWN_COMMENT");
    expect((await fan.agent.post(`/api/comments/${c.id}/report`).send({ reason: "RUDE" })).status).toBe(400);
  });
});

describe("hiding a comment (department admin)", () => {
  it("needs a reason, is audited, and the comment disappears for every citizen (author too)", async () => {
    const issue = await publicReport();
    const c = (await comment(fan.agent, issue.id, "abusive words here")).body.comment;
    await agent.post(`/api/comments/${c.id}/report`).send({ reason: "ABUSIVE" });

    expect((await roads.agent.post(`/api/admin/comments/${c.id}/hide`).send({})).status).toBe(400);
    const res = await roads.agent.post(`/api/admin/comments/${c.id}/hide`).send({ reason: "Abusive language" });
    expect(res.status).toBe(200);
    expect(res.body.comment).toMatchObject({ hidden: { reason: "Abusive language", by: { id: roads.admin.id } }, reports: { total: 1, byReason: { ABUSIVE: 1 } } });

    const audit = await prisma.auditLog.findFirst({ where: { action: "COMMENT_HIDDEN", targetId: c.id } });
    expect(audit).toMatchObject({ actorId: roads.admin.id, targetType: "COMMENT", reason: "Abusive language" });

    expect((await commentsOf(fan.agent, issue.id)).items).toEqual([]);
    expect((await commentsOf(agent, issue.id)).total).toBe(0);
    expect((await fan.agent.get("/api/feed")).body.items[0].community.comments).toBe(0);
    expect((await agent.post(`/api/comments/${c.id}/report`).send({ reason: "SPAM" })).status).toBe(404);

    // The admin still sees it, with the reports.
    const adminList = (await roads.agent.get(`/api/admin/issues/${issue.id}/comments`)).body;
    expect(adminList.items[0]).toMatchObject({ id: c.id, author: { id: fan.user.id }, hidden: { reason: "Abusive language" } });
    expect((await roads.agent.post(`/api/admin/comments/${c.id}/hide`).send({ reason: "again" })).body.error.code).toBe("ALREADY_HIDDEN");
  });

  it("another department's admin gets 404; citizens can't reach admin routes", async () => {
    const issue = await publicReport();
    const c = (await comment(fan.agent, issue.id)).body.comment;
    const swm = await adminOf(prisma, app, "SOLID_WASTE");
    expect((await swm.agent.post(`/api/admin/comments/${c.id}/hide`).send({ reason: "Not ours" })).status).toBe(404);
    expect((await swm.agent.get(`/api/admin/issues/${issue.id}/comments`)).status).toBe(404);
    expect((await fan.agent.post(`/api/admin/comments/${c.id}/hide`).send({ reason: "I dislike it" })).status).toBe(403);
    expect(await prisma.comment.count({ where: { hiddenAt: { not: null } } })).toBe(0);
  });
});

describe("official replies", () => {
  it("department admin posts it; signed with the department; followers notified; audited; can't be hidden or reported", async () => {
    const issue = await publicReport();
    await fan.agent.post(`/api/issues/${issue.id}/support`).send({});
    const upvoter = await anotherCitizen(prisma, app);
    await upvoter.agent.post(`/api/issues/${issue.id}/upvote`);

    const body = "Contractor assigned, expected by 20 Oct";
    const res = await roads.agent.post(`/api/admin/issues/${issue.id}/replies`).send({ body });
    expect(res.status).toBe(201);
    const id = res.body.comment.id;
    const dept = await prisma.department.findUnique({ where: { code: "CONSTRUCTION" } });

    const [shown] = (await commentsOf(upvoter.agent, issue.id)).items;
    expect(shown).toEqual({ id, body, createdAt: expect.any(String), official: true, author: { department: dept.name }, mine: false, reportedByMe: false });
    expect(JSON.stringify(shown)).not.toContain(roads.admin.name);
    expect((await upvoter.agent.get("/api/feed")).body.items[0].latestOfficialReply).toMatchObject({ id, body, official: true });

    for (const user of [citizen, fan.user]) {
      const notes = await notificationsOf(prisma, user.id);
      expect(notes.map((n) => n.type)).toEqual(["OFFICIAL_REPLY"]);
      expect(notes[0].params).toEqual({ commentId: id, department: dept.name, excerpt: body });
    }
    expect(await notificationsOf(prisma, upvoter.user.id)).toEqual([]); // upvotes don't follow an issue

    expect(await prisma.auditLog.findFirst({ where: { action: "OFFICIAL_REPLY_POSTED", targetId: issue.id } })).toMatchObject({
      actorId: roads.admin.id,
      targetType: "ISSUE",
      metadata: { commentId: id },
    });
    expect((await roads.agent.post(`/api/admin/comments/${id}/hide`).send({ reason: "oops" })).body.error.code).toBe("CANNOT_HIDE_OFFICIAL");
    expect((await fan.agent.post(`/api/comments/${id}/report`).send({ reason: "SPAM" })).body.error.code).toBe("OFFICIAL_REPLY");
  });

  it("works before the issue is public: the reporter reads it, strangers can't", async () => {
    const hidden = await newReport(agent);
    expect((await roads.agent.post(`/api/admin/issues/${hidden.id}/replies`).send({ body: "We are checking the photo" })).status).toBe(201);
    expect((await commentsOf(agent, hidden.id)).items[0]).toMatchObject({ official: true, body: "We are checking the photo" });
    expect((await fan.agent.get(`/api/issues/${hidden.id}/comments`)).status).toBe(404);
  });

  it("only the issue's department admin; body checked", async () => {
    const issue = await publicReport();
    const swm = await adminOf(prisma, app, "SOLID_WASTE");
    expect((await swm.agent.post(`/api/admin/issues/${issue.id}/replies`).send({ body: "Not ours to say" })).status).toBe(404);
    expect((await fan.agent.post(`/api/admin/issues/${issue.id}/replies`).send({ body: "Pretend official" })).status).toBe(403);
    expect((await roads.agent.post(`/api/admin/issues/${issue.id}/replies`).send({ body: "  " })).status).toBe(400);
    expect(await prisma.comment.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });
});
