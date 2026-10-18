// Background jobs on the existing Postgres (pg-boss). One queue so far: photo validation.
import { PgBoss } from "pg-boss";
import { runPhotoValidation, MAX_ATTEMPTS } from "../modules/issues/validation.service.js";
import { runIssueEmbedding, MAX_EMBEDDING_ATTEMPTS } from "../modules/issues/duplicates.service.js";

export const QUEUE = Object.freeze({ VALIDATE_PHOTO: "validate-photo", EMBED_ISSUE: "embed-issue" });

/** Real queue (used by `npm run dev` / `npm start`). */
export function createJobQueue({ connectionString, prisma, storage, validatePhoto, embed }) {
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
      await this.sweep();
    },

    enqueuePhotoValidation({ issueId, photoId }) {
      // singletonKey: the same photo is never queued twice at the same time.
      return boss.send(QUEUE.VALIDATE_PHOTO, { issueId, photoId }, { singletonKey: `photo:${photoId}` });
    },

    enqueueEmbedding({ issueId }) {
      return boss.send(QUEUE.EMBED_ISSUE, { issueId }, { singletonKey: `embed:${issueId}` });
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
    async sweep() {},
    async stop() {},
  };
}
