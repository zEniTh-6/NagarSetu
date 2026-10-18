// Runs before each test file is loaded: point the app at the test database.
import { getTestDatabaseUrl } from "./testDbUrl.js";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = getTestDatabaseUrl().url;
process.env.WEB_ORIGIN ??= "http://localhost:5173";
