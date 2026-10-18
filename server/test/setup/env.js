// Runs before each test file is loaded: point the app at the test database and use
// test-only secrets, fast bcrypt and the in-memory mail outbox (whatever .env says).
import { getTestDatabaseUrl } from "./testDbUrl.js";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = getTestDatabaseUrl().url;
process.env.WEB_ORIGIN ??= "http://localhost:5173";
process.env.JWT_SECRET = "test-jwt-secret-0123456789abcdefghijklmnop";
process.env.OTP_SECRET = "test-otp-secret-0123456789abcdefghijklmnop";
process.env.BCRYPT_COST = "4";
process.env.MAIL_TRANSPORT = "memory";
