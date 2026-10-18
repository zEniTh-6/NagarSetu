// Live check of the REAL Gemini photo check against test/fixtures/photos (needs GEMINI_API_KEY).
// Not part of `npm test`. Usage: npm run ai:photos
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processPhoto } from "../src/images/processPhoto.js";
import { validatePhotoWithGemini } from "../src/ai/gemini.js";
import { env } from "../src/config/env.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures/photos");
const { photos } = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));

if (!env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set in .env");
  process.exit(1);
}
console.log(`Model: ${env.GEMINI_MODEL} — ${photos.length} photo(s)\n`);

let mismatches = 0;
const rows = [];
for (const p of photos) {
  try {
    const processed = await processPhoto(await fs.readFile(path.join(dir, p.file)));
    const r = await validatePhotoWithGemini({ image: processed.public, mimeType: "image/jpeg", categoryKey: p.category });
    const ok = p.expect.length ? p.expect.includes(r.verdict) : null; // null = expectation not filled in yet
    if (ok === false) mismatches++;
    rows.push({ file: p.file, category: p.category, expected: p.expect.join("|") || "?", got: r.verdict, ok: ok === null ? "?" : ok ? "yes" : "NO", suggested: r.suggestedCategory ?? "", risk: r.risk.level, reason: r.reason });
  } catch (err) {
    mismatches++;
    rows.push({ file: p.file, category: p.category, expected: p.expect.join("|"), got: "ERROR", ok: "NO", reason: err.message });
  }
}
console.table(rows);
console.log(mismatches ? `\n${mismatches} photo(s) did not match.` : "\nAll photos matched.");
process.exitCode = mismatches ? 1 : 0;
