import { describe, expect, it } from "vitest";
import { afterLoginPath, homePathFor, safeNext } from "./session.js";

const u = (role, extra = {}) => ({ role, mustChangePassword: false, ...extra });

describe("homePathFor", () => {
  it("sends each role to its own home", () => {
    expect(homePathFor(u("CITIZEN"))).toBe("/citizen");
    expect(homePathFor(u("ADMIN"))).toBe("/admin");
    expect(homePathFor(u("CONTRACTOR"))).toBe("/contractor");
  });
  it("sends a user who must change their password to change-password first", () => {
    expect(homePathFor(u("ADMIN", { mustChangePassword: true }))).toBe("/change-password");
  });
  it("sends nobody to login", () => {
    expect(homePathFor(null)).toBe("/login");
  });
});

describe("safeNext / afterLoginPath", () => {
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("/citizen/x")).toBe("/citizen/x");
  });
  it("follows next only inside the user's own area", () => {
    expect(afterLoginPath(u("CITIZEN"), "/citizen/issues/1")).toBe("/citizen/issues/1");
    expect(afterLoginPath(u("CITIZEN"), "/admin")).toBe("/citizen");
    expect(afterLoginPath(u("CONTRACTOR"), "/contractorx")).toBe("/contractor");
    expect(afterLoginPath(u("ADMIN", { mustChangePassword: true }), "/admin")).toBe("/change-password");
  });
});
