// Environment config, validated once at startup with Zod.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
// One .env at the repo root, shared with docker-compose.yml. Real env vars win over the file.
dotenv.config({ path: path.join(here, "..", "..", "..", ".env"), quiet: true });

const postgresUrl = z
  .string()
  .url()
  .refine((v) => /^postgres(ql)?:\/\//.test(v), "must be a postgresql:// URL");

const secret = z
  .string()
  .min(32, "must be at least 32 characters (see .env.example for a generator command)")
  .refine((v) => !v.startsWith("change_me"), "still has the placeholder value from .env.example");

export const envSchema = z
  .object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url(),
  JSON_BODY_LIMIT: z
    .string()
    .regex(/^\d+(b|kb|mb)$/i, "use a size like 100kb")
    .default("100kb"),
  DATABASE_URL: postgresUrl,
  TEST_DATABASE_URL: postgresUrl.optional(),

  // Auth
  JWT_SECRET: secret,
  OTP_SECRET: secret,
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  // Email: "log" prints emails to the console (dev), "smtp" sends them, "memory" is for tests.
  MAIL_TRANSPORT: z.enum(["log", "smtp", "memory"]).default("log"),
  MAIL_FROM: z.string().min(3).default("NagarSetu <no-reply@nagarsetu.local>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // AI (Gemini). Without a key the server still runs: reports are saved as "validation pending".
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(45_000),

  // Uploads (local disk in development, behind the storage interface)
  UPLOAD_DIR: z.string().min(1).default("uploads"),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(25).default(10),

  // Reports must be inside this rectangle: minLng,minLat,maxLng,maxLat (decimal degrees).
  // Default: SMKC (Sangli-Miraj-Kupwad), 16°46'28"–16°53'45" N, 74°31'08"–74°40'51" E.
  SERVICE_AREA_BBOX: z
    .string()
    .default("74.518889,16.774444,74.680833,16.895833")
    .transform((v, ctx) => {
      const n = v.split(",").map(Number);
      const [minLng, minLat, maxLng, maxLat] = n;
      if (n.length !== 4 || n.some((x) => !Number.isFinite(x)) || minLng >= maxLng || minLat >= maxLat) {
        ctx.addIssue({ code: "custom", message: "use minLng,minLat,maxLng,maxLat" });
        return z.NEVER;
      }
      return { minLng, minLat, maxLng, maxLat };
    }),

  // Background jobs (pg-boss). Tests turn this off and call the job code directly.
  JOBS_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  })
  .superRefine((e, ctx) => {
    if (e.MAIL_TRANSPORT === "smtp" && !e.SMTP_HOST) {
      ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "required when MAIL_TRANSPORT=smtp" });
    }
    if (e.NODE_ENV === "production" && e.BCRYPT_COST < 12) {
      ctx.addIssue({ code: "custom", path: ["BCRYPT_COST"], message: "must be at least 12 in production" });
    }
  });

/** Parse an env object. Throws an Error listing every invalid variable (values are not printed). */
export function parseEnv(source) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example.`);
  }
  return Object.freeze(result.data);
}

export const env = parseEnv(process.env);
