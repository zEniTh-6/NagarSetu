// Gemini photo checker. The rest of the app only sees `validatePhoto(...)`, so the model or the
// provider can be swapped without touching the report flow.
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { buildPhotoPrompt, photoCheckJsonSchema, photoCheckSchema } from "./photoCheck.js";

export class AiUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AiUnavailableError";
    this.cause = cause;
  }
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
    throw new AiUnavailableError(abort.signal.aborted ? "Gemini timed out" : `Gemini request failed: ${err.message}`, err);
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
