// Storage interface for photos. Development uses the local disk; a cloud bucket (OD-7) can
// replace it later by implementing the same three methods.
//   put(key, buffer, contentType) → Promise<void>
//   get(key) → Promise<Buffer>   (throws NOT_FOUND)
//   exists(key) → Promise<boolean>
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEY = /^[a-z0-9][a-z0-9/_.-]*$/i;

export function createLocalDiskStorage(rootDir = path.resolve(serverDir, env.UPLOAD_DIR)) {
  const root = path.resolve(rootDir);
  const resolveKey = (key) => {
    if (!KEY.test(key) || key.includes("..")) throw new Error(`Invalid storage key: ${key}`);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  };

  return {
    root,
    async put(key, buffer) {
      const file = resolveKey(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, buffer);
    },
    async get(key) {
      try {
        return await fs.readFile(resolveKey(key));
      } catch (err) {
        if (err.code === "ENOENT") throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
        throw err;
      }
    },
    async exists(key) {
      try {
        await fs.access(resolveKey(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}
