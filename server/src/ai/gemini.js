// Gemini photo checker. The rest of the app only sees `validatePhoto(...)`, so the model or the
// provider can be swapped without touching the report flow.
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { buildPhotoPrompt, photoCheckJsonSchema, photoCheckSchema } from "./photoCheck.js";

export class AiUnavailableError extends Error {
  /** @param {{ kind?: "timeout"|"rate_limited"|"error", retryAfterSeconds?: number }} [info] */
  constructor(message, cause, { kind = "error", retryAfterSeconds } = {}) {
    super(message);
    this.name = "AiUnavailableError";
    this.cause = cause;
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Turns an SDK error into a short, readable AiUnavailableError. */
function describeFailure(err, timedOut) {
  if (timedOut) return new AiUnavailableError(`Gemini timed out after ${env.GEMINI_TIMEOUT_MS / 1000} s`, err, { kind: "timeout" });
  const status = err?.status;
  if (status === 429) {
    const match = /retry in ([\d.]+)s/i.exec(err.message ?? "");
    const retryAfterSeconds = match ? Math.ceil(Number(match[1])) : undefined;
    return new AiUnavailableError(
      `Gemini rate limit reached (quota for ${env.GEMINI_MODEL})${retryAfterSeconds ? `, retry in ${retryAfterSeconds} s` : ""}`,
      err,
      { kind: "rate_limited", retryAfterSeconds },
    );
  }
  const brief = String(err?.message ?? err).split("\n")[0].slice(0, 200);
  return new AiUnavailableError(`Gemini request failed${status ? ` (HTTP ${status})` : ""}: ${brief}`, err);
}

let client;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }));

/**
 * @param {{ image: Buffer, mimeType: string, categoryKey: string }} input
 * @returns {Promise<{ verdict, reason, suggestedCategory, risk: { level, reason }, model }>}
 * @throws {AiUnavailableError} on missing key, timeout, network/API error or an answer that
 *         doesn't match the schema. Callers treat every throw as "validation pending, retry later".
 */
export async function validatePhotoWithGemini({ image, mimeType, categoryKey }) {
  if (!env.GEMINI_API_KEY) throw new AiUnavailableError("GEMINI_API_KEY is not set");

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), env.GEMINI_TIMEOUT_MS);
  let response;
  try {
    response = await getClient().models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType, data: image.toString("base64") } }, { text: buildPhotoPrompt(categoryKey) }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: photoCheckJsonSchema(),
        temperature: 0,
        abortSignal: abort.signal,
      },
    });
  } catch (err) {
    throw describeFailure(err, abort.signal.aborted);
  } finally {
    clearTimeout(timer);
  }

  let parsed;
  try {
    parsed = photoCheckSchema.parse(JSON.parse(response.text ?? ""));
  } catch (err) {
    throw new AiUnavailableError("Gemini answer did not match the expected JSON", err);
  }
  return { ...parsed, model: env.GEMINI_MODEL };
}
export const describeFailureForTest = describeFailure;
