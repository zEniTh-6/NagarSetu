// Prepares real photos in test/fixtures/photos for committing:
//   1. shrinks each to max 1600 px and re-saves as JPEG (~200–500 KB),
//   2. removes ALL metadata (EXIF, including the GPS location where it was taken),
//   3. adds a manifest entry for every photo that doesn't have one yet.
// The files are changed in place, so keep your phone originals elsewhere.
// Usage: npm run fixtures:prepare
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures/photos");
const manifestPath = path.join(dir, "manifest.json");
const MAX_PX = 1600;

// Expected verdicts for the file names suggested in the README / chat.
const KNOWN = {
  "road-pothole": ["ROADS", ["VALID"], "Clear pothole on a road"],
  "road-pothole-water": ["ROADS", ["VALID"], "Water-filled pothole (risk should be HIGH)"],
  "road-footpath-broken": ["ROADS", ["VALID"], "Broken / cracked footpath"],
  "road-intact": ["ROADS", ["INVALID", "UNCERTAIN"], "Normal road, no damage"],
  "garbage-dump": ["GARBAGE", ["VALID"], "Roadside dumping spot"],
  "garbage-overflowing-bin": ["GARBAGE", ["VALID"], "Overflowing public bin"],
  "garbage-clean-street": ["GARBAGE", ["INVALID", "UNCERTAIN"], "Clean street, no garbage"],
  "streetlight-dark-night": ["STREETLIGHT", ["VALID", "UNCERTAIN"], "Lamp off at night"],
  "streetlight-broken": ["STREETLIGHT", ["VALID"], "Damaged / hanging lamp or pole"],
  "streetlight-wires": ["STREETLIGHT", ["VALID"], "Exposed wires (risk should be HIGH/CRITICAL)"],
  "streetlight-day-working": ["STREETLIGHT", ["UNCERTAIN", "INVALID"], "Working lamp in daytime"],
  "wrong-category-garbage-as-road": ["ROADS", ["UNCERTAIN"], "Garbage photo reported as Roads; should suggest GARBAGE"],
  selfie: ["ROADS", ["INVALID"], "Selfie (team member, with consent)"],
  "indoor-room": ["ROADS", ["INVALID"], "Indoor photo"],
  "dark-blurry": ["ROADS", ["UNCERTAIN"], "Very dark / blurry outdoor photo"],
};
const guessCategory = (name) =>
  name.startsWith("garbage") ? "GARBAGE" : name.startsWith("streetlight") ? "STREETLIGHT" : "ROADS";

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const files = (await fs.readdir(dir)).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f));
let changed = 0;

for (const file of files) {
  if (file === "screenshot-app.png") continue; // generated fixture, keep as is
  const full = path.join(dir, file);
  const base = file.replace(/\.[^.]+$/, "");
  const target = `${base}.jpg`;

  let meta;
  try {
    meta = await sharp(full).metadata();
  } catch {
    console.warn(`SKIPPED ${file}: can't read it (HEIC? save it as JPEG from your phone/Photos app)`);
    continue;
  }
  const needsWork = meta.exif || meta.xmp || meta.iptc || meta.format !== "jpeg" || Math.max(meta.width, meta.height) > MAX_PX || file !== target;
  if (needsWork) {
    const out = await sharp(full)
      .rotate()
      .resize({ width: MAX_PX, height: MAX_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer(); // no .withMetadata(): all EXIF/GPS is dropped
    await fs.writeFile(path.join(dir, target), out);
    if (file !== target) await fs.unlink(full);
    console.log(`prepared ${file} → ${target} (${Math.round(out.length / 1024)} KB, metadata removed)`);
    changed++;
    // keep the manifest pointing at the new name
    for (const p of manifest.photos) if (p.file === file) p.file = target;
  }

  if (!manifest.photos.some((p) => p.file === target)) {
    const [category, expect, note] = KNOWN[base] ?? [guessCategory(base), [], "FILL IN: what the photo shows and the expected verdict(s)"];
    manifest.photos.push({ file: target, category, expect, note, source: "Taken by the team", license: "Project-owned" });
    console.log(`added manifest entry for ${target}${KNOWN[base] ? "" : "  ← fill in 'expect' and 'note'"}`);
  }
}

const present = new Set(await fs.readdir(dir));
for (const p of manifest.photos) if (!present.has(p.file)) console.warn(`WARNING: manifest lists ${p.file} but the file is missing`);

await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nDone. ${changed} photo(s) prepared, ${manifest.photos.length} manifest entries. Next: npm run ai:photos`);
