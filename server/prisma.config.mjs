// Prisma 7 config. Prisma no longer reads .env by itself, so load the repo-root .env here.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, "..", ".env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },
  datasource: {
    // `prisma generate` doesn't need a database, so allow it to run without DATABASE_URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
