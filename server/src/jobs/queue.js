// Background jobs on the existing Postgres (pg-boss): report photo check, embeddings, repair photo
// check, and the scheduled deadline check (escalation).
import { PgBoss } from "pg-boss";
import { runPhotoValidation, MAX_ATTEMPTS } from "../modules/issues/validation.service.js";
import { runIssueEmbedding, MAX_EMBEDDING_ATTEMPTS } from "../modules/issues/duplicates.service.js";
import { runRepairValidation, MAX_REPAIR_CHECK_ATTEMPTS } from "../modules/work/repairs.service.js";
import { runDeadlineCheck } from "../modules/work/escalation.service.js";

export const QUEUE = Object.freeze({ VALIDATE_PHOTO: "validate-photo", EMBED_ISSUE: "embed-issue", VALIDATE_REPAIR: "validate-repair", DEADLINE_CHECK: "deadline-check" });
export const DEADLINE_CHECK_CRON = "*/15 * * * *"; // every 15 minutes

/** Real queue (used by `npm run dev` / `npm start`). */
export function createJobQueue({ connectionString, prisma, storage, validatePhoto, embed, validateRepair }) {
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err) => console.error("pg-boss error:", err));

  return {
    async start() {
      await boss.start();
      await boss.createQueue(QUEUE.VALIDATE_PHOTO, {
        retryLimit: MAX_ATTEMPTS - 1,
        retryDelay: 30, // seconds; doubles each retry
        retryBackoff: true,
        retryDelayMax: 30 * 60,
      });
      await boss.work(QUEUE.VALIDATE_PHOTO, async ([job]) => {
        const result = await runPhotoValidation(prisma, job.data, { validatePhoto, storage });
        if (result.outcome === "retry") throw new Error(`Photo check will be retried: ${result.reason}`);
        return result;
      });
      await boss.createQueue(QUEUE.EMBED_ISSUE, {
        retryLimit: MAX_EMBEDDING_ATTEMPTS - 1,
        retryDelay: 30,
        retryBackoff: true,
        retryDelayMax: 30 * 60,
      });
      await boss.work(QUEUE.EMBED_ISSUE, async ([job]) => {
        const result = await runIssueEmbedding(prisma, job.data, { embed });
        if (result.outcome === "retry") throw new Error(`Embedding will be retried: ${result.reason}`);
        return result;
      });
      await boss.createQueue(QUEUE.VALIDATE_REPAIR, {
        retryLimit: MAX_REPAIR_CHECK_ATTEMPTS - 1,
        retryDelay: 30,
        retryBackoff: true,
        retryDelayMax: 30 * 60,
      });
      await boss.work(QUEUE.VALIDATE_REPAIR, async ([job]) => {
        const result = await runRepairValidation(prisma, job.data, { validateRepair, storage });
        if (result.outcome === "retry") throw new Error(`Repair check will be retried: ${result.reason}`);
        return result;
      });
      // Deadline escalation: scheduled, so it also runs after a restart. Only one run at a time.
      await boss.createQueue(QUEUE.DEADLINE_CHECK, { policy: "singleton" });
      await boss.schedule(QUEUE.DEADLINE_CHECK, DEADLINE_CHECK_CRON);
      await boss.work(QUEUE.DEADLINE_CHECK, async () => {
        const r = await runDeadlineCheck(prisma);
        if (r.escalated.length || r.cleared.length) console.log(`Deadline check: ${r.escalated.length} escalated, ${r.cleared.length} cleared`);
        return r;
      });
      await this.sweep();
    },

    enqueuePhotoValidation({ issueId, photoId }) {
      // singletonKey: the same photo is never queued twice at the same time.
      return boss.send(QUEUE.VALIDATE_PHOTO, { issueId, photoId }, { singletonKey: `photo:${photoId}` });
    },

    /** recheck: the issue changed category; search again with the stored embedding. */
    enqueueEmbedding({ issueId, recheck = false }) {
      const data = recheck ? { issueId, recheck: true } : { issueId };
      return boss.send(QUEUE.EMBED_ISSUE, data, { singletonKey: `${recheck ? "recheck" : "embed"}:${issueId}` });
    },

    enqueueRepairValidation({ submissionId }) {
      return boss.send(QUEUE.VALIDATE_REPAIR, { submissionId }, { singletonKey: `repair:${submissionId}` });
    },

    /** On start-up, queue checks that never got queued (e.g. the server stopped right after a report). */
    async sweep() {
      const pending = await prisma.issue.findMany({
        where: { aiVerdict: null, aiAttempts: { lt: MAX_ATTEMPTS }, status: "REPORTED" },
        select: { id: true, photos: { where: { kind: "ISSUE_ORIGINAL", replacedAt: null }, select: { id: true } } },
      });
      for (const issue of pending) {
        const photo = issue.photos[0];
        if (photo) await this.enqueuePhotoValidation({ issueId: issue.id, photoId: photo.id });
      }
      if (pending.length) console.log(`Queued ${pending.length} pending photo check(s)`);

      const unembedded = await prisma.issue.findMany({
        where: { embeddedAt: null, embeddingAttempts: { lt: MAX_EMBEDDING_ATTEMPTS }, status: { in: ["REPORTED", "ACKNOWLEDGED", "IN_PROGRESS"] } },
        select: { id: true },
      });
      for (const issue of unembedded) await this.enqueueEmbedding({ issueId: issue.id });
      if (unembedded.length) console.log(`Queued ${unembedded.length} pending embedding(s)`);

      const repairs = await prisma.repairSubmission.findMany({
        where: { status: "SUBMITTED", aiVerdict: null, aiAttempts: { lt: MAX_REPAIR_CHECK_ATTEMPTS } },
        select: { id: true },
      });
      for (const s of repairs) await this.enqueueRepairValidation({ submissionId: s.id });
      if (repairs.length) console.log(`Queued ${repairs.length} pending repair check(s)`);
    },

    stop: () => boss.stop({ graceful: true }),
  };
}

/** Records jobs instead of running them (tests, or JOBS_ENABLED=false). */
export function createMemoryQueue() {
  const sent = [];
  return {
    sent,
    async start() {},
    async enqueuePhotoValidation(data) {
      sent.push({ name: QUEUE.VALIDATE_PHOTO, data });
      return `memory-${sent.length}`;
    },
    async enqueueEmbedding(data) {
      sent.push({ name: QUEUE.EMBED_ISSUE, data });
      return `memory-${sent.length}`;
    },
    async enqueueRepairValidation(data) {
      sent.push({ name: QUEUE.VALIDATE_REPAIR, data });
      return `memory-${sent.length}`;
    },
    async sweep() {},
    async stop() {},
  };
}
