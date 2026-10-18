// Gemini photo checks (report photo and repair evidence). The rest of the app only sees
// `validatePhoto(...)` / `validateRepair(...)`, so the model or the provider can be swapped.
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { buildPhotoPrompt, photoCheckJsonSchema, photoCheckSchema } from "./photoCheck.js";
import { buildRepairPrompt, repairCheckJsonSchema, repairCheckSchema } from "./repairCheck.js";

export class AiUnavailableError extends Error {
  /**
   * kind: "timeout" | "rate_limited" (per-minute quota) | "daily_quota" (free tier per-day quota used up)
   *       | "unavailable" (Gemini overloaded / 5xx) | "error"
   * @param {{ kind?: string, retryAfterSeconds?: number }} [info]
   */
  constructor(message, cause, { kind = "error", retryAfterSeconds } = {}) {
    super(message);
    this.name = "AiUnavailableError";
    this.cause = cause;
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Turns an SDK error into a short, readable AiUnavailableError. */
export function describeFailure(err, timedOut, { model = env.GEMINI_MODEL, timeoutMs = env.GEMINI_TIMEOUT_MS } = {}) {
  if (timedOut) return new AiUnavailableError(`Gemini timed out after ${timeoutMs / 1000} s`, err, { kind: "timeout" });
  const status = err?.status;
  if (status === 429 && /PerDay/i.test(err.message ?? "")) {
    return new AiUnavailableError(`Gemini daily free quota used up for ${model}`, err, { kind: "daily_quota" });
  }
  if (status === 503 || status === 500 || status === 502 || status === 504) {
    return new AiUnavailableError(`Gemini is overloaded or unavailable (HTTP ${status})`, err, { kind: "unavailable" });
  }
  if (status === 429) {
    const match = /retry in ([\d.]+)s/i.exec(err.message ?? "");
    const retryAfterSeconds = match ? Math.ceil(Number(match[1])) : undefined;
    return new AiUnavailableError(
      `Gemini rate limit reached (quota for ${model})${retryAfterSeconds ? `, retry in ${retryAfterSeconds} s` : ""}`,
      err,
      { kind: "rate_limited", retryAfterSeconds },
    );
  }
  const brief = String(err?.message ?? err).split("\n")[0].slice(0, 200);
  return new AiUnavailableError(`Gemini request failed${status ? ` (HTTP ${status})` : ""}: ${brief}`, err);
}

let client;
export const getClient = () => (client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }));

/**
 * One Gemini call that must answer JSON matching `schema` (Zod) / `jsonSchema` (sent to Gemini).
 * @throws {AiUnavailableError} on missing key, timeout, network/API error or a non-matching answer.
 */
async function generateJson({ parts, schema, jsonSchema }) {
  if (!env.GEMINI_API_KEY) throw new AiUnavailableError("GEMINI_API_KEY is not set");

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), env.GEMINI_TIMEOUT_MS);
  let response;
  try {
    response = await getClient().models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        temperature: 0,
        abortSignal: abort.signal,
      },
    });
  } catch (err) {
    throw describeFailure(err, abort.signal.aborted);
  } finally {
    clearTimeout(timer);
  }

  try {
    return { ...schema.parse(JSON.parse(response.text ?? "")), model: env.GEMINI_MODEL };
  } catch (err) {
    throw new AiUnavailableError("Gemini answer did not match the expected JSON", err);
  }
}

const imagePart = (image, mimeType) => ({ inlineData: { mimeType, data: image.toString("base64") } });

/**
 * Report photo check.
 * @param {{ image: Buffer, mimeType: string, categoryKey: string }} input
 * @returns {Promise<{ verdict, reason, suggestedCategory, risk: { level, reason }, model }>}
 * @throws {AiUnavailableError} callers treat every throw as "validation pending, retry later".
 */
export function validatePhotoWithGemini({ image, mimeType, categoryKey }) {
  return generateJson({
    parts: [imagePart(image, mimeType), { text: buildPhotoPrompt(categoryKey) }],
    schema: photoCheckSchema,
    jsonSchema: photoCheckJsonSchema(),
  });
}

/**
 * Repair evidence check: the citizen's photo first, then the contractor's repair photo.
 * @param {{ before: Buffer, after: Buffer, categoryKey: string }} input (both public JPEG copies)
 * @returns {Promise<{ verdict, reason, model }>}
 */
export function validateRepairWithGemini({ before, after, categoryKey }) {
  return generateJson({
    parts: [imagePart(before, "image/jpeg"), imagePart(after, "image/jpeg"), { text: buildRepairPrompt(categoryKey) }],
    schema: repairCheckSchema,
    jsonSchema: repairCheckJsonSchema(),
  });
}
export const describeFailureForTest = describeFailure; // kept for tests
