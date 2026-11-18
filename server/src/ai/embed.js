// The ONE place that turns text into an embedding (`embed(text)` must be swappable).
// Model: Gemini gemini-embedding-001, multilingual, cut to 768 dimensions (D-011).
// Shortened Gemini vectors are not unit length, so we normalise them: then cosine similarity
// in pgvector (1 - (a <=> b)) behaves as expected.
import { env } from "../config/env.js";
import { AiUnavailableError, describeFailure, getClient } from "./gemini.js";

export const EMBEDDING_DIM = 768;
export const embeddingModelName = () => env.GEMINI_EMBEDDING_MODEL;

export function normalize(values) {
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  if (!norm || !Number.isFinite(norm)) throw new AiUnavailableError("Embedding is empty");
  return values.map((v) => v / norm);
}

/**
 * @param {string} text  the citizen's description, exactly as written (any language/script)
 * @returns {Promise<number[]>} unit-length vector of EMBEDDING_DIM numbers
 * @throws {AiUnavailableError} on missing key, timeout, quota, network/API error or a bad answer
 */
export async function embed(text) {
  return (await embedMany([text]))[0];
}

/** Several texts in one request (used by the similarity script). */
export async function embedMany(texts) {
  if (!env.GEMINI_API_KEY) throw new AiUnavailableError("GEMINI_API_KEY is not set");
  const model = embeddingModelName();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), env.EMBED_TIMEOUT_MS);
  let response;
  try {
    response = await getClient().models.embedContent({
      model,
      contents: texts,
      config: { taskType: "SEMANTIC_SIMILARITY", outputDimensionality: EMBEDDING_DIM, abortSignal: abort.signal },
    });
  } catch (err) {
    throw describeFailure(err, abort.signal.aborted, { model, timeoutMs: env.EMBED_TIMEOUT_MS });
  } finally {
    clearTimeout(timer);
  }
  const vectors = response.embeddings?.map((e) => e.values) ?? [];
  if (vectors.length !== texts.length || vectors.some((v) => !Array.isArray(v) || v.length !== EMBEDDING_DIM)) {
    throw new AiUnavailableError("Embedding answer had an unexpected shape");
  }
  return vectors.map(normalize);
}
