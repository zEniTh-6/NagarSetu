import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp } from "./helpers/app.js";
import { citizenSetup, adminOf } from "./helpers/issues.js";
import { anotherCitizen, newReport } from "./helpers/admin.js";

let app, citizen, agent, roads;

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp();
  ({ citizen, agent } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
});
afterAll(() => prisma.$disconnect());

describe("in-app notifications (polled)", () => {
  it("the citizen sees their own notifications, newest first, with an unread count", async () => {
    const a = await newReport(agent);
    const b = await newReport(agent);
    await roads.agent.post(`/api/admin/issues/${a.id}/accept`).send({});
    await roads.agent.post(`/api/admin/issues/${b.id}/reject`).send({ type: "NOT_VALID", reason: "Not a public road" });

    const res = await agent.get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 2, unread: 2, page: 1 });
    expect(res.body.items.map((n) => [n.type, n.issueId])).toEqual([["REJECTED", b.id], ["ACKNOWLEDGED", a.id]]);
    // Data, not sentences: the web app shows it in the user's language. The admin's reason is kept as written.
    expect(res.body.items[0].params).toEqual({ rejectionType: "NOT_VALID", reason: "Not a public road" });
    expect(res.body.items[1].params).toEqual({});
  });

  it("mark one read, mark all read; unreadOnly filter", async () => {
    const a = await newReport(agent);
    const b = await newReport(agent);
    await roads.agent.post(`/api/admin/issues/${a.id}/accept`).send({});
    await roads.agent.post(`/api/admin/issues/${b.id}/accept`).send({});
    const { body } = await agent.get("/api/notifications");

    const one = await agent.post(`/api/notifications/${body.items[0].id}/read`).send({});
    expect(one.status).toBe(200);
    expect(one.body.notification.readAt).toBeTruthy();
    expect((await agent.get("/api/notifications?unreadOnly=true")).body).toMatchObject({ total: 1, unread: 1 });

    expect((await agent.post("/api/notifications/read-all").send({})).body).toEqual({ marked: 1 });
    expect((await agent.get("/api/notifications")).body.unread).toBe(0);
  });

  it("only the owner: someone else's notification answers 404 and stays unread", async () => {
    const issue = await newReport(agent);
    await roads.agent.post(`/api/admin/issues/${issue.id}/accept`).send({});
    const [n] = await prisma.notification.findMany({ where: { userId: citizen.id } });

    const other = await anotherCitizen(prisma, app);
    expect((await other.agent.get("/api/notifications")).body.items).toEqual([]);
    expect((await other.agent.post(`/api/notifications/${n.id}/read`).send({})).status).toBe(404);
    expect((await roads.agent.post(`/api/notifications/${n.id}/read`).send({})).status).toBe(404);
    expect((await prisma.notification.findUnique({ where: { id: n.id } })).readAt).toBeNull();
    expect((await request(app).get("/api/notifications")).status).toBe(401);
  });
});
