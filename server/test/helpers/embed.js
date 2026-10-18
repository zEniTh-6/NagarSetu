// Fake embedder for tests: texts about the same concept (in any of our languages) point the same
// way; other texts get a hash-based direction. It tests OUR duplicate logic, not the model's
// language skills (that's `npm run ai:similarity` with the real model).
import crypto from "node:crypto";
import { EMBEDDING_DIM, normalize } from "../../src/ai/embed.js";

const CONCEPTS = [
  ["pothole", "gaddha", "gadda", "गड्ढा", "खड्डा", "khadda", "khadde"],
  ["garbage", "kachra", "कचरा", "कचऱ्याचा", "waste"],
  ["streetlight", "batti", "बत्ती", "दिवा", "light"],
];

function hashDirection(text) {
  const out = new Array(EMBEDDING_DIM).fill(0);
  for (let i = 0; i < 16; i++) {
    const h = crypto.createHash("sha256").update(`${i}:${text}`).digest();
    out[h.readUInt16BE(0) % EMBEDDING_DIM] += h[2] % 2 ? 1 : -1;
  }
  return out;
}

export async function fakeEmbed(text) {
  const lower = text.toLowerCase();
  const v = hashDirection(lower).map((x) => x * 0.08);
  CONCEPTS.forEach((words, i) => {
    if (words.some((w) => lower.includes(w))) v[700 + i] += 1;
  });
  return normalize(v);
}

export const failingEmbed = async () => {
  const { AiUnavailableError } = await import("../../src/ai/gemini.js");
  throw new AiUnavailableError("Gemini rate limit reached", null, { kind: "rate_limited" });
};
