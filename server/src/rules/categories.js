// Loads and validates src/rules/categories.json once.
import { readFileSync } from "node:fs";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().min(1),
  department: z.string().regex(/^[A-Z_]+$/),
  duplicateRadiusM: z.number().positive().max(500),
  photoPrompt: z.string().min(20),
  valid: z.array(z.string().min(1)).min(1),
  invalidExamples: z.array(z.string().min(1)),
  riskFactors: z.array(z.string().min(1)).min(1),
  repair: z.object({
    valid: z.array(z.string().min(1)).min(1),
    invalid: z.array(z.string().min(1)).min(1),
  }),
  notes: z.array(z.string()),
});

export const rulesFileSchema = z.object({
  _note: z.string().optional(),
  categories: z.record(z.string().regex(/^[A-Z_]+$/), categorySchema),
});

const raw = JSON.parse(readFileSync(new URL("./categories.json", import.meta.url), "utf8"));
export const categoryRules = Object.freeze(rulesFileSchema.parse(raw).categories);

/** Rules for one category key (e.g. "ROADS"). Throws if the key is unknown. */
export function getCategoryRules(key) {
  const rules = categoryRules[key];
  if (!rules) throw new Error(`Unknown category key: ${key}`);
  return rules;
}
