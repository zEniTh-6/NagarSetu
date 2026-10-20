import { describe, expect, it } from "vitest";
import en from "./en.json";
import hi from "./hi.json";
import mr from "./mr.json";

const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));

const keys = (obj) => flatten(obj).map(([k]) => k).sort();
const placeholders = (s) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe("translation files", () => {
  it.each([
    ["hi", hi],
    ["mr", mr],
  ])("%s has exactly the same keys as en", (_name, lang) => {
    expect(keys(lang)).toEqual(keys(en));
  });

  it.each([
    ["hi", hi],
    ["mr", mr],
  ])("%s keeps every {{placeholder}} from en", (_name, lang) => {
    const other = Object.fromEntries(flatten(lang));
    for (const [key, value] of flatten(en)) {
      expect(placeholders(other[key]), key).toEqual(placeholders(value));
    }
  });

  it("has no empty strings", () => {
    for (const lang of [en, hi, mr]) {
      for (const [key, value] of flatten(lang)) expect(String(value).trim(), key).not.toBe("");
    }
  });

  it("has a message for every auth error code the server sends", () => {
    const codes = [
      "INVALID_CREDENTIALS", "ACCOUNT_LOCKED", "ACCOUNT_DEACTIVATED", "PASSWORD_CHANGE_REQUIRED", "NOT_AUTHENTICATED",
      "SESSION_EXPIRED", "EMAIL_TAKEN", "OTP_INVALID", "OTP_EXPIRED", "OTP_TOO_MANY_ATTEMPTS", "OTP_COOLDOWN",
      "WRONG_CURRENT_PASSWORD", "PASSWORD_UNCHANGED", "RESET_LINK_INVALID", "INVITE_NOT_FOUND", "INVITE_USED",
      "INVITE_EXPIRED", "VALIDATION_FAILED", "RATE_LIMITED",
    ];
    for (const code of codes) expect(en.errors[code], code).toBeTruthy();
  });
});
