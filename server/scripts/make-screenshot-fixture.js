// Generates test/fixtures/photos/screenshot-app.png: a fake phone screenshot (an INVALID case).
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures/photos/screenshot-app.png");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1480">
  <rect width="720" height="1480" fill="#f4f5f7"/>
  <rect width="720" height="72" fill="#1f2937"/>
  <text x="32" y="48" font-family="sans-serif" font-size="30" fill="#fff">9:41</text>
  <text x="560" y="48" font-family="sans-serif" font-size="28" fill="#fff">100%</text>
  <rect y="72" width="720" height="120" fill="#2563eb"/>
  <text x="32" y="150" font-family="sans-serif" font-size="44" fill="#fff">Messages</text>
  ${Array.from({ length: 8 }, (_, i) => `
  <rect x="24" y="${230 + i * 150}" width="672" height="120" rx="16" fill="#fff"/>
  <circle cx="90" cy="${290 + i * 150}" r="38" fill="#cbd5e1"/>
  <text x="150" y="${280 + i * 150}" font-family="sans-serif" font-size="30" fill="#111">Contact ${i + 1}</text>
  <text x="150" y="${320 + i * 150}" font-family="sans-serif" font-size="24" fill="#6b7280">See you tomorrow at 10</text>`).join("")}
</svg>`;
await sharp(Buffer.from(svg)).png().toFile(out);
console.log("Wrote", out);
