// Live check of the REAL Gemini photo check against test/fixtures/photos (needs GEMINI_API_KEY).
// Not part of `npm test`.
//
//   npm run ai:photos                 check photos that have no saved result yet
//   npm run ai:photos -- --fresh      re-check everything (uses more quota)
//   npm run ai:photos -- --only selfie.jpg
//
// Free-tier keys have small per-minute AND per-day limits, so this script goes slowly, retries
// sensibly, stops as soon as the daily quota is used up, and saves results in
// test/fixtures/photos/.ai-results.local.json (not committed) so the next run continues.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processPhoto } from "../src/images/processPhoto.js";
import { validatePhotoWithGemini } from "../src/ai/gemini.js";
import { env } from "../src/config/env.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures/photos");
const resultsPath = path.join(dir, ".ai-results.local.json");
const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const delaySeconds = Number(process.env.AI_PHOTOS_DELAY_SECONDS ?? 13);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

if (!env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set in .env");
  process.exit(1);
}

const { photos } = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
let saved = {};
try {
  saved = JSON.parse(await fs.readFile(resultsPath, "utf8"));
} catch {
  /* first run */
}
const keyOf = (p, bytes) => `${env.GEMINI_MODEL}|${p.category}|${crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`;

class DailyQuotaError extends Error {}

/** Retries only when it makes sense, because every attempt counts against the quota. */
async function checkWithRetry(input, label) {
  const limits = { rate_limited: 3, unavailable: 2, timeout: 1 };
  const used = { rate_limited: 0, unavailable: 0, timeout: 0 };
  for (;;) {
    try {
      return await validatePhotoWithGemini(input);
    } catch (err) {
      if (err.kind === "daily_quota") throw new DailyQuotaError(err.message);
      if (!(err.kind in limits) || used[err.kind] >= limits[err.kind]) throw err;
      used[err.kind]++;
      const wait = err.kind === "rate_limited" ? (err.retryAfterSeconds ?? 60) + 2 : err.kind === "unavailable" ? 20 * used.unavailable : 5;
      console.log(`  ${label}: ${err.message}. Waiting ${wait} s, then trying again…`);
      await sleep(wait);
    }
  }
}

const todo = photos.filter((p) => !only || p.file === only);
console.log(`Model: ${env.GEMINI_MODEL} · timeout ${env.GEMINI_TIMEOUT_MS / 1000} s · ${todo.length} photo(s)${fresh ? " · fresh run" : ""}`);
console.log(`Pausing ${delaySeconds} s between calls (free tier ≈ 5 requests/minute).\n`);

let stoppedEarly = null;
let calls = 0;
for (const [i, p] of todo.entries()) {
  let bytes;
  try {
    bytes = await fs.readFile(path.join(dir, p.file));
  } catch {
    saved[`missing|${p.file}`] = undefined;
    console.log(`(${i + 1}/${todo.length}) ${p.file}: file not found (check the name)`);
    continue;
  }
  const key = keyOf(p, bytes);
  if (!fresh && saved[key]) {
    console.log(`(${i + 1}/${todo.length}) ${p.file}: saved result, skipped`);
    continue;
  }
  if (calls > 0) await sleep(delaySeconds);
  calls++;
  console.log(`(${i + 1}/${todo.length}) ${p.file}`);
  try {
    const processed = await processPhoto(bytes);
    const r = await checkWithRetry({ image: processed.public, mimeType: "image/jpeg", categoryKey: p.category }, p.file);
    saved[key] = { file: p.file, verdict: r.verdict, suggested: r.suggestedCategory, risk: r.risk.level, reason: r.reason, at: new Date().toISOString() };
    await fs.writeFile(resultsPath, JSON.stringify(saved, null, 2));
  } catch (err) {
    if (err instanceof DailyQuotaError) {
      stoppedEarly = err.message;
      break;
    }
    console.log(`  ${p.file}: ${err.message}`);
  }
}

// Report every photo, using saved results where present.
let mismatches = 0;
let unchecked = 0;
const rows = [];
for (const p of photos.filter((x) => !only || x.file === only)) {
  let bytes = null;
  try {
    bytes = await fs.readFile(path.join(dir, p.file));
  } catch {
    /* missing */
  }
  const r = bytes ? saved[keyOf(p, bytes)] : null;
  const expected = p.expect.join("|") || "?";
  if (!r) {
    unchecked++;
    rows.push({ file: p.file, category: p.category, expected, got: bytes ? "not checked" : "FILE MISSING", ok: "-" });
    continue;
  }
  const ok = p.expect.length ? p.expect.includes(r.verdict) : null;
  if (ok === false) mismatches++;
  rows.push({ file: p.file, category: p.category, expected, got: r.verdict, ok: ok === null ? "?" : ok ? "yes" : "NO", suggested: r.suggested ?? "", risk: r.risk, reason: r.reason });
}
console.table(rows);
if (stoppedEarly) console.log(`\nStopped: ${stoppedEarly}. Results so far are saved; run again tomorrow (or with another model, see README) to check the rest.`);
console.log(`\n${rows.length - unchecked - mismatches} matched · ${mismatches} did not match · ${unchecked} not checked yet.`);
process.exitCode = mismatches ? 1 : 0;
