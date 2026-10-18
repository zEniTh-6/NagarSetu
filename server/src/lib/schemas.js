import { z } from "zod";

/** Emails are compared and stored in lower case. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const nameSchema = z.string().trim().min(2).max(100);

/** Indian or international number; stored as entered (trimmed), compared by its last 10 digits. */
export const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => /^\+?[\d\s()-]+$/.test(v) && v.replace(/\D/g, "").length >= 10, "must be a phone number with at least 10 digits");

export const phoneKey = (phone) => (phone ? phone.replace(/\D/g, "").slice(-10) : "");
