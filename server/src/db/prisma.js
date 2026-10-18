// The single Prisma client for the app. Prisma 7 connects through the pg driver adapter.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { env } from "../config/env.js";

export function createPrisma(connectionString = env.DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = createPrisma();
