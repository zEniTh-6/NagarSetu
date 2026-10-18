// One end-to-end check with the real pg-boss queue (the other tests run the job code directly).
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createJobQueue } from "../src/jobs/queue.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { citizenSetup, report, fakeValidator } from "./helpers/issues.js";
import { fakeEmbed } from "./helpers/embed.js";

let queue;
beforeEach(() => resetDb(prisma));
afterAll(async () => {
  await queue?.stop();
  await prisma.$disconnect();
});

describe("pg-boss photo check queue", () => {
  it("a queued report gets checked by the worker", async () => {
    const storage = tempStorage();
    queue = createJobQueue({
      connectionString: process.env.DATABASE_URL,
      prisma,
      storage,
      validatePhoto: fakeValidator({ verdict: "VALID" }),
      embed: fakeEmbed,
    });
    await queue.start();
    const app = makeTestApp({ storage, jobs: queue });
    const { agent } = await citizenSetup(prisma, app);
    const { body } = await report(agent);
    expect(body.issue.id).toBeDefined();

    let verdict = null;
    for (let i = 0; i < 40 && !verdict; i++) {
      await new Promise((r) => setTimeout(r, 250));
      verdict = (await prisma.issue.findUnique({ where: { id: body.issue.id } })).aiVerdict;
    }
    expect(verdict).toBe("VALID");
  }, 30_000);
});
