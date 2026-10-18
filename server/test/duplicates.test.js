import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { runIssueEmbedding, MAX_EMBEDDING_ATTEMPTS } from "../src/modules/issues/duplicates.service.js";
import { vectorLiteral } from "../src/geo/duplicates.js";
import { embed as realEmbed, normalize } from "../src/ai/embed.js";
import { AiUnavailableError } from "../src/ai/gemini.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { makeUser, loginAgent } from "./helpers/auth.js";
import { citizenSetup, report, adminOf, SANGLI } from "./helpers/issues.js";
import { fakeEmbed, failingEmbed } from "./helpers/embed.js";

let app, jobs, agent, other;
const near = { lat: SANGLI.lat + 0.00005, lng: SANGLI.lng }; // ~5.5 m away
const far = { lat: SANGLI.lat + 0.0009, lng: SANGLI.lng }; // ~100 m away

beforeEach(async () => {
  await resetDb(prisma);
  jobs = createMemoryQueue();
  app = makeTestApp({ jobs, storage: tempStorage(), embed: fakeEmbed });
  ({ agent } = await citizenSetup(prisma, app));
  other = await loginAgent(app, (await makeUser(prisma, { emailVerified: true })).email);
});
afterAll(() => prisma.$disconnect());

const embedJob = (issueId, embed = fakeEmbed) => runIssueEmbedding(prisma, { issueId }, { embed, model: "fake-embed" });

/** A report by the first citizen, already embedded (as the background job would do). */
async function existingIssue(fields = {}) {
  const res = await report(agent, { description: "Huge pothole near the bus stand", ...fields });
  expect(res.status).toBe(201);
  await embedJob(res.body.issue.id);
  return res.body.issue;
}
const check = (who, body) =>
  who.post("/api/issues/duplicate-check").send({ categoryKey: "ROADS", lat: near.lat, lng: near.lng, description: "road pe bada gaddha hai", ...body });

describe("duplicate check before submitting", () => {
  it("same category + active + nearby + similar text (English vs Hinglish) → shown as a candidate", async () => {
    const existing = await existingIssue();
    const res = await check(other);
    expect(res.status).toBe(200);
    expect(res.body.checked).toBe(true);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0]).toMatchObject({ id: existing.id, status: "REPORTED", category: { key: "ROADS" }, supporters: 0 });
    expect(res.body.candidates[0].distanceM).toBeLessThan(15);
    expect(res.body.candidates[0].similarity).toBeGreaterThanOrEqual(0.75);
  });

  it("a different category at the same spot is not a duplicate", async () => {
    await existingIssue();
    const res = await check(other, { categoryKey: "GARBAGE" });
    expect(res.body.candidates).toEqual([]);
  });

  it("outside the category radius (Roads 15 m) is not a duplicate", async () => {
    await existingIssue();
    expect((await check(other, far)).body.candidates).toEqual([]);
  });

  it("nearby but about something else is not a duplicate", async () => {
    await existingIssue();
    expect((await check(other, { description: "Water pipe leaking on the corner since morning" })).body.candidates).toEqual([]);
  });

  it("closed issues (resolved, withdrawn, rejected) are not offered", async () => {
    const existing = await existingIssue();
    for (const status of ["RESOLVED", "WITHDRAWN", "REJECTED"]) {
      await prisma.issue.update({ where: { id: existing.id }, data: { status } });
      expect((await check(other)).body.candidates).toEqual([]);
    }
  });

  it("issues still waiting for their embedding are simply not matched yet", async () => {
    await report(agent, { description: "Huge pothole near the bus stand" }); // no embedding job run
    expect((await check(other)).body.candidates).toEqual([]);
  });

  it("embedding service down → { checked: false }, the citizen just continues (never blocks)", async () => {
    await existingIssue();
    const downApp = makeTestApp({ jobs, storage: tempStorage(), embed: failingEmbed });
    const u = await loginAgent(downApp, (await makeUser(prisma, { emailVerified: true })).email);
    const res = await check(u);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checked: false, candidates: [] });
  });

  it("needs a verified citizen", async () => {
    const unverified = await loginAgent(app, (await makeUser(prisma, { emailVerified: false })).email);
    expect((await check(unverified)).status).toBe(403);
  });
});

describe("accept: support the existing issue instead of creating a new one", () => {
  it("adds the citizen as a supporter; no new issue; repeat is harmless", async () => {
    const existing = await existingIssue();
    const res = await other.post(`/api/issues/${existing.id}/support`).send({ fromDuplicatePopup: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ supporting: true, alreadySupporting: false, supporters: 1 });
    expect(await prisma.issue.count()).toBe(1);
    expect((await prisma.issueSupporter.findFirst()).source).toBe("DUPLICATE_ACCEPTED");

    const again = await other.post(`/api/issues/${existing.id}/support`).send({ fromDuplicatePopup: true });
    expect(again.body).toMatchObject({ alreadySupporting: true, supporters: 1 });
    expect((await check(await loginAgent(app, (await makeUser(prisma, { emailVerified: true })).email))).body.candidates[0].supporters).toBe(1);
  });

  it("not your own issue, not a closed one, not a missing one", async () => {
    const existing = await existingIssue();
    expect((await agent.post(`/api/issues/${existing.id}/support`).send({})).body.error.code).toBe("OWN_ISSUE");
    await prisma.issue.update({ where: { id: existing.id }, data: { status: "RESOLVED" } });
    expect((await other.post(`/api/issues/${existing.id}/support`).send({})).body.error.code).toBe("ISSUE_NOT_ACTIVE");
    expect((await other.post(`/api/issues/${crypto.randomUUID()}/support`).send({})).status).toBe(404);
  });
});

describe("deny: file a new report anyway", () => {
  it("creates the issue with a POSSIBLE_DUPLICATE flag naming the existing one (audited, never merged)", async () => {
    const existing = await existingIssue();
    const res = await report(other, { ...near, description: "road pe bada gaddha hai", duplicateCandidateIds: existing.id });
    expect(res.status).toBe(201);
    expect(await prisma.issue.count()).toBe(2);

    const flags = await prisma.issueFlag.findMany({ where: { issueId: res.body.issue.id } });
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("POSSIBLE_DUPLICATE");
    expect(flags[0].reason).toContain(existing.id);
    expect(flags[0].reason).toMatch(/citizen saw it/);
    expect(await prisma.auditLog.count({ where: { action: "FLAG_ADDED", targetId: res.body.issue.id } })).toBe(1);

    // The admin sees it; the citizen does not see flags.
    const { agent: roadsAdmin } = await adminOf(prisma, app, "CONSTRUCTION");
    expect((await roadsAdmin.get(`/api/issues/${res.body.issue.id}`)).body.issue.flags.map((f) => f.type)).toEqual(["POSSIBLE_DUPLICATE"]);
    expect((await other.get(`/api/issues/${res.body.issue.id}`)).body.issue.flags).toBeUndefined();
  });

  it("ignores ids that aren't active issues of the same category", async () => {
    const garbage = await existingIssue({ categoryKey: "GARBAGE", description: "kachra pile" });
    const res = await report(other, { duplicateCandidateIds: `${garbage.id},${crypto.randomUUID()}` });
    expect(res.status).toBe(201);
    expect(await prisma.issueFlag.count({ where: { issueId: res.body.issue.id } })).toBe(0);
  });
});

describe("background embedding job", () => {
  it("stores a unit-length 768-d vector, queued once per new report", async () => {
    const res = await report(agent);
    expect(jobs.sent.filter((j) => j.name === "embed-issue")).toEqual([{ name: "embed-issue", data: { issueId: res.body.issue.id } }]);
    expect((await embedJob(res.body.issue.id)).outcome).toBe("done");
    const [row] = await prisma.$queryRaw`SELECT vector_dims(embedding) AS dims, vector_norm(embedding) AS norm, embedding_model AS model FROM issues`;
    expect(row.dims).toBe(768);
    expect(row.norm).toBeCloseTo(1, 4);
    expect(row.model).toBe("fake-embed");
    expect((await embedJob(res.body.issue.id)).outcome).toBe("skipped");
  });

  it("re-checks on the server: a similar older report nearby → POSSIBLE_DUPLICATE (found automatically)", async () => {
    const existing = await existingIssue();
    const dup = await report(other, { ...near, description: "road pe bada gaddha hai" }); // web app skipped the popup
    const result = await embedJob(dup.body.issue.id);
    expect(result.candidates).toEqual([existing.id]);
    const flag = await prisma.issueFlag.findFirst({ where: { issueId: dup.body.issue.id } });
    expect(flag.reason).toMatch(/found automatically/);
    // The older report is not flagged.
    expect(await prisma.issueFlag.count({ where: { issueId: existing.id } })).toBe(0);
  });

  it("doesn't add a second flag when the citizen already declined the popup", async () => {
    const existing = await existingIssue();
    const dup = await report(other, { ...near, description: "road pe bada gaddha hai", duplicateCandidateIds: existing.id });
    await embedJob(dup.body.issue.id);
    expect(await prisma.issueFlag.count({ where: { issueId: dup.body.issue.id } })).toBe(1);
  });

  it("no similar report → no flag", async () => {
    await existingIssue();
    const unrelated = await report(other, { ...near, description: "Footpath tiles missing outside the school" });
    await embedJob(unrelated.body.issue.id);
    expect(await prisma.issueFlag.count({ where: { issueId: unrelated.body.issue.id } })).toBe(0);
  });

  it(`embedding failures are retried, then given up after ${MAX_EMBEDDING_ATTEMPTS} attempts (report unaffected)`, async () => {
    const res = await report(agent);
    const outcomes = [];
    for (let i = 0; i < MAX_EMBEDDING_ATTEMPTS; i++) outcomes.push((await embedJob(res.body.issue.id, failingEmbed)).outcome);
    expect(outcomes.at(-1)).toBe("gave_up");
    expect(outcomes.slice(0, -1).every((o) => o === "retry")).toBe(true);
    expect((await prisma.issue.findUnique({ where: { id: res.body.issue.id } })).status).toBe("REPORTED");
  });
});

describe("embed() and vector helpers", () => {
  it("normalize gives unit length; vectorLiteral rejects bad numbers", () => {
    const v = normalize([3, 4]);
    expect(v).toEqual([0.6, 0.8]);
    expect(() => vectorLiteral([1, NaN])).toThrow();
    expect(vectorLiteral([0.5, -1])).toBe("[0.5,-1]");
  });

  it("without an API key embed() is just 'AI unavailable'", async () => {
    await expect(realEmbed("road pe gaddha hai")).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
