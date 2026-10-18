// Reads TEST_DATABASE_URL from the repo-root .env and refuses anything that isn't a *_test database.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, "..", "..", "..", ".env"), quiet: true });

export function getTestDatabaseUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set. Add it to the repo-root .env (see .env.example).");
  const url = new URL(raw);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run tests: TEST_DATABASE_URL database "${dbName}" must end in _test (tests wipe it).`);
  }
  return { url: raw, dbName };
}
