import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createLocalDiskStorage } from "./storage/storage.js";
import { createJobQueue, createMemoryQueue } from "./jobs/queue.js";
import { validatePhotoWithGemini } from "./ai/gemini.js";

const storage = createLocalDiskStorage();
const jobs = env.JOBS_ENABLED
  ? createJobQueue({ connectionString: env.DATABASE_URL, prisma, storage, validatePhoto: validatePhotoWithGemini })
  : createMemoryQueue();

await jobs.start();
if (!env.GEMINI_API_KEY) console.warn("GEMINI_API_KEY is not set: photo checks will stay 'pending' until it is.");

const app = createApp({ prisma, storage, jobs });
const server = app.listen(env.PORT, () => {
  console.log(`NagarSetu API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await jobs.stop();
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
