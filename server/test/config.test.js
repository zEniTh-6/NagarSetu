import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/config/env.js";

const valid = {
  NODE_ENV: "development",
  PORT: "4000",
  WEB_ORIGIN: "http://localhost:5173",
  JSON_BODY_LIMIT: "100kb",
  DATABASE_URL: "postgresql://u:p@localhost:5432/nagarsetu",
  JWT_SECRET: "a".repeat(32),
  OTP_SECRET: "b".repeat(32),
};

describe("env config", () => {
  it("accepts a valid config and coerces PORT", () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("applies defaults", () => {
    const { PORT, JSON_BODY_LIMIT, NODE_ENV, ...rest } = valid;
    const env = parseEnv(rest);
    expect(env).toMatchObject({ PORT: 4000, JSON_BODY_LIMIT: "100kb", NODE_ENV: "development" });
  });

  it("rejects a missing DATABASE_URL without printing values", () => {
    const { DATABASE_URL, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://u:p@h/db" })).toThrow(/postgresql/);
  });

  it("rejects a bad WEB_ORIGIN, PORT and body limit", () => {
    expect(() => parseEnv({ ...valid, WEB_ORIGIN: "not a url" })).toThrow(/WEB_ORIGIN/);
    expect(() => parseEnv({ ...valid, PORT: "99999" })).toThrow(/PORT/);
    expect(() => parseEnv({ ...valid, JSON_BODY_LIMIT: "lots" })).toThrow(/JSON_BODY_LIMIT/);
  });

  it("rejects short or placeholder secrets", () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ ...valid, OTP_SECRET: "change_me_to_a_long_random_string_please" })).toThrow(/placeholder/);
  });

  it("requires SMTP_HOST when MAIL_TRANSPORT=smtp", () => {
    expect(() => parseEnv({ ...valid, MAIL_TRANSPORT: "smtp" })).toThrow(/SMTP_HOST/);
    expect(parseEnv({ ...valid, MAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.com" }).SMTP_PORT).toBe(587);
  });

  it("refuses a low bcrypt cost in production", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "production", BCRYPT_COST: "4" })).toThrow(/BCRYPT_COST/);
  });

  it("does not leak secret values in the error message", () => {
    try {
      parseEnv({ ...valid, DATABASE_URL: "mysql://user:supersecret@h/db" });
    } catch (e) {
      expect(e.message).not.toContain("supersecret");
    }
  });
});
