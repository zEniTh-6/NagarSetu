// Runs once before all tests: create the test database if needed and apply migrations to it.
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { getTestDatabaseUrl } from "./testDbUrl.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export default async function setup() {
  const { url, dbName } = getTestDatabaseUrl();

  // Connect to the maintenance database on the same server to create the test database.
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (rowCount === 0) {
      // Identifiers can't be bind parameters; the name is checked above (ends in _test) and quoted here.
      await client.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
      console.log(`Created test database ${dbName}`);
    }
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
