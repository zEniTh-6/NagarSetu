import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { runPhotoValidation, MAX_ATTEMPTS } from "../src/modules/issues/validation.service.js";
import { FLAG_REASON } from "../src/modules/issues/flags.js";
import { AiUnavailableError, validatePhotoWithGemini } from "../src/ai/gemini.js";
import { buildPhotoPrompt, photoCheckSchema } from "../src/ai/photoCheck.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { citizenSetup, report, fakeValidator } from "./helpers/issues.js";

let app, jobs, storage, agent;

beforeEach(async () => {
  await resetDb(prisma);
  jobs = createMemoryQueue();
  storage = tempStorage();
  app = makeTestApp({ jobs, storage });
  ({ agent } = await citizenSetup(prisma, app));
});
afterAll(() => prisma.$disconnect());

async function newReport(fields) {
  const res = await report(agent, fields);
  expect(res.status).toBe(201);
  return { issueId: res.body.issue.id, job: jobs.sent.at(-1).data };
}
const run = (job, validatePhoto) => runPhotoValidation(prisma, job, { validatePhoto, storage });
const citizenState = async (issueId) => (await agent.get(`/api/issues/${issueId}`)).body.issue.validation;
const activeFlags = (issueId) => prisma.issueFlag.findMany({ where: { issueId, clearedAt: null } });

describe("AI photo check results", () => {
  it("VALID: stored, no flags, citizen sees OK", async () => {
    const { issueId, job } = await newReport();
    expect(await run(job, fakeValidator({ verdict: "VALID" }))).toMatchObject({ outcome: "done", verdict: "VALID" });
    const row = await prisma.issue.findUnique({ where: { id: issueId } });
    expect(row).toMatchObject({ aiVerdict: "VALID", aiRiskLevel: "MEDIUM", aiModel: "fake-model", aiAttempts: 1, status: "REPORTED" });
    expect(await activeFlags(issueId)).toHaveLength(0);
    expect(await citizenState(issueId)).toEqual({ state: "OK" });
  });

  it("selfie or screenshot → INVALID: the citizen is asked to retake; the report is NOT rejected", async () => {
    const { issueId, job } = await newReport();
    await run(job, fakeValidator({ verdict: "INVALID", reason: "This is a selfie, not a road" }));
    expect(await citizenState(issueId)).toEqual({ state: "RETAKE_REQUESTED", reason: "This is a selfie, not a road" });
    expect((await prisma.issue.findUnique({ where: { id: issueId } })).status).toBe("REPORTED");
  });

  it("UNCERTAIN → admin review flag (audited), never auto-rejected", async () => {
    const { issueId, job } = await newReport();
    await run(job, fakeValidator({ verdict: "UNCERTAIN", reason: "Too dark to tell" }));
    const flags = await activeFlags(issueId);
    expect(flags.map((f) => [f.type, f.reason])).toEqual([["PENDING_REVIEW", FLAG_REASON.AI_UNCERTAIN]]);
    expect(await prisma.auditLog.count({ where: { action: "FLAG_ADDED", targetId: issueId } })).toBe(1);
    expect(await citizenState(issueId)).toEqual({ state: "UNDER_REVIEW" });
    expect((await prisma.issue.findUnique({ where: { id: issueId } })).status).toBe("REPORTED");
  });

  it("stores another suggested category (department suggestion) without changing the report", async () => {
    const { issueId, job } = await newReport();
    await run(job, fakeValidator({ verdict: "UNCERTAIN", suggestedCategory: "GARBAGE" }));
    const row = await prisma.issue.findUnique({ where: { id: issueId }, include: { category: true, aiSuggestedCategory: true } });
    expect(row.category.key).toBe("ROADS");
    expect(row.aiSuggestedCategory.key).toBe("GARBAGE");
  });
});

describe("Gemini failure never blocks the report", () => {
  const timeout = async () => {
    throw new AiUnavailableError("Gemini timed out");
  };

  it("timeout → saved as 'validation pending' and retried; a later success clears the flag", async () => {
    const { issueId, job } = await newReport();
    expect((await run(job, timeout)).outcome).toBe("retry");

    let flags = await activeFlags(issueId);
    expect(flags.map((f) => f.reason)).toEqual([FLAG_REASON.VALIDATION_PENDING]);
    expect(await citizenState(issueId)).toEqual({ state: "CHECKING" });

    // A second failure doesn't add a second flag.
    await run(job, timeout);
    expect(await activeFlags(issueId)).toHaveLength(1);

    expect((await run(job, fakeValidator({ verdict: "VALID" }))).outcome).toBe("done");
    expect(await activeFlags(issueId)).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { action: "FLAG_CLEARED", targetId: issueId } })).toBe(1);
  });

  it(`after ${MAX_ATTEMPTS} failures it gives up and leaves it to the admin`, async () => {
    const { issueId, job } = await newReport();
    const outcomes = [];
    for (let i = 0; i < MAX_ATTEMPTS; i++) outcomes.push((await run(job, timeout)).outcome);
    expect(outcomes.at(-1)).toBe("gave_up");
    expect(outcomes.slice(0, -1).every((o) => o === "retry")).toBe(true);
    const flags = await activeFlags(issueId);
    expect(flags.map((f) => f.reason)).toEqual([FLAG_REASON.VALIDATION_GAVE_UP]);
    expect(await citizenState(issueId)).toEqual({ state: "UNDER_REVIEW" });
  });

  it("a missing API key is just another 'AI unavailable'", async () => {
    await expect(validatePhotoWithGemini({ image: Buffer.from("x"), mimeType: "image/jpeg", categoryKey: "ROADS" })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it("skips a job whose photo was replaced in the meantime", async () => {
    const { job } = await newReport();
    await prisma.photo.update({ where: { id: job.photoId }, data: { replacedAt: new Date() } });
    expect(await run(job, fakeValidator())).toMatchObject({ outcome: "skipped" });
  });
});

describe("prompt and answer format", () => {
  it("the prompt uses the category rules and never includes the citizen's text", () => {
    const prompt = buildPhotoPrompt("STREETLIGHT");
    expect(prompt).toMatch(/STREETLIGHT/);
    expect(prompt).toMatch(/exposed wires/);
    expect(prompt).toMatch(/answer UNCERTAIN/);
    expect(prompt).toMatch(/GARBAGE/); // other categories are listed for suggestions
  });

  it("rejects answers that don't match the schema; unknown suggested categories become null", () => {
    expect(() => photoCheckSchema.parse({ verdict: "REJECT", reason: "x", suggestedCategory: null, risk: { level: "LOW", reason: "x" } })).toThrow();
    const ok = photoCheckSchema.parse({ verdict: "VALID", reason: "ok", suggestedCategory: "WATER", risk: { level: "LOW", reason: "ok" } });
    expect(ok.suggestedCategory).toBeNull();
  });
});

describe("Gemini error messages", () => {
  it("are short and say what happened", async () => {
    const { describeFailureForTest } = await import("../src/ai/gemini.js");
    const quota = Object.assign(new Error('{"error":{"code":429,"message":"You exceeded your current quota ... Please retry in 45.31s."}}'), { status: 429 });
    const e = describeFailureForTest(quota, false);
    expect(e).toMatchObject({ kind: "rate_limited", retryAfterSeconds: 46 });
    expect(e.message.length).toBeLessThan(120);
    expect(describeFailureForTest(new Error("aborted"), true).kind).toBe("timeout");
    const daily = Object.assign(new Error('{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}'), { status: 429 });
    expect(describeFailureForTest(daily, false).kind).toBe("daily_quota");
    expect(describeFailureForTest(Object.assign(new Error("high demand"), { status: 503 }), false).kind).toBe("unavailable");
  });
});
