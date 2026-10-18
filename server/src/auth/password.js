import bcrypt from "bcrypt";
import { z } from "zod";
import { env } from "../config/env.js";

// bcrypt only uses the first 72 bytes, so longer passwords are rejected instead of silently cut.
export const passwordSchema = z
  .string()
  .min(8, "must be at least 8 characters")
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "must be at most 72 bytes");

export const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_COST);

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Compared against when the account doesn't exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", env.BCRYPT_COST);
export const burnPasswordCheck = (plain) => bcrypt.compare(plain, DUMMY_HASH);
