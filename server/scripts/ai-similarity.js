// How similar does the REAL embedding model find our multilingual test texts?
// Not part of `npm test`; needs GEMINI_API_KEY. Usage: npm run ai:similarity [-- --fresh]
//
// Prints the weakest "same problem" pairs, the strongest "different problem" pairs (overall and
// within the same category — the ones the threshold must separate), and a suggested threshold.
// Embeddings are cached in test/fixtures/.embeddings.local.json (not committed) to save quota.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { embedMany, embeddingModelName } from "../src/ai/embed.js";
import { env } from "../src/config/env.js";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures");
const cachePath = path.join(fixtures, ".embeddings.local.json");
const fresh = process.argv.includes("--fresh");

if (!env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set in .env");
  process.exit(1);
}

const { groups } = JSON.parse(await fs.readFile(path.join(fixtures, "texts.json"), "utf8"));
const items = groups.flatMap((g) => Object.entries(g.texts).map(([lang, text]) => ({ group: g.id, category: g.category, lang, text })));

let cache = {};
if (!fresh) {
  try {
    cache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    /* first run */
  }
}
const model = embeddingModelName();
const key = (t) => `${model}|${t}`;
const missing = items.filter((i) => !cache[key(i.text)]);
console.log(`Model: ${model} · ${items.length} texts · ${missing.length} to embed (${items.length - missing.length} cached)`);

const sleep = (sec) => new Promise((r) => setTimeout(r, sec * 1000));
for (let i = 0; i < missing.length; i += 20) {
  const batch = missing.slice(i, i + 20);
  for (let attempt = 1; ; attempt++) {
    try {
      const vectors = await embedMany(batch.map((b) => b.text));
      batch.forEach((b, j) => (cache[key(b.text)] = vectors[j]));
      await fs.writeFile(cachePath, JSON.stringify(cache));
      break;
    } catch (err) {
      const retryable = (err.kind === "rate_limited" || err.kind === "unavailable" || err.kind === "timeout") && attempt < 4;
      if (!retryable) {
        console.error(`\nStopped: ${err.message}`);
        console.error("Embeddings done so far are saved; run the command again later.");
        process.exit(1);
      }
      const wait = err.kind === "rate_limited" ? (err.retryAfterSeconds ?? 60) + 2 : 20 * attempt;
      console.log(`  ${err.message}. Waiting ${wait} s, then trying again…`);
      await sleep(wait);
    }
  }
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0); // vectors are unit length → cosine
const same = [];
const diffSameCategory = [];
const diffOther = [];
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const a = items[i];
    const b = items[j];
    const sim = Math.round(dot(cache[key(a.text)], cache[key(b.text)]) * 1000) / 1000;
    const row = { a: `${a.group} [${a.lang}]`, b: `${b.group} [${b.lang}]`, similarity: sim };
    if (a.group === b.group) same.push(row);
    else if (a.category && a.category === b.category) diffSameCategory.push(row);
    else diffOther.push(row);
  }
}
same.sort((x, y) => x.similarity - y.similarity);
diffSameCategory.sort((x, y) => y.similarity - x.similarity);
diffOther.sort((x, y) => y.similarity - x.similarity);

console.log("\nSame problem, different language (weakest first) — these SHOULD be above the threshold:");
console.table(same.slice(0, 10));
console.log("Different problems in the SAME category (strongest first) — these should be BELOW the threshold:");
console.table(diffSameCategory.slice(0, 8));
console.log("Different problems, other categories (strongest first) — the category filter already separates these:");
console.table(diffOther.slice(0, 5));

const minSame = same[0].similarity;
const maxDiff = diffSameCategory[0]?.similarity ?? 0;
console.log(`\nWeakest same-problem pair:          ${minSame}`);
console.log(`Strongest different-problem pair:   ${maxDiff}  (same category)`);
console.log(`Current DUPLICATE_SIMILARITY_THRESHOLD: ${env.DUPLICATE_SIMILARITY_THRESHOLD}`);
if (minSame > maxDiff) {
  console.log(`→ Cleanly separated. A threshold between them works; middle ≈ ${Math.round(((minSame + maxDiff) / 2) * 100) / 100}.`);
} else {
  console.log("→ Overlap: some same-problem pairs score lower than different problems. Location (radius) still filters,");
  console.log("  so prefer a threshold that keeps most same-problem pairs (the admin reviews flags; nothing is merged).");
}
const missed = same.filter((r) => r.similarity < env.DUPLICATE_SIMILARITY_THRESHOLD);
console.log(`With the current threshold, ${missed.length} of ${same.length} same-problem pairs would be missed.`);
