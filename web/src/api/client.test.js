import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, fieldErrors, setAuthHandlers } from "./client.js";
import { json, mockApi } from "../test/utils.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  setAuthHandlers({ onUnauthenticated: null, onPasswordChangeRequired: null, onDeactivated: null });
});

describe("api()", () => {
  it("sends JSON to /api with same-origin credentials and returns the body", async () => {
    const fetch = mockApi({ "POST /api/auth/login": () => json(200, { user: { id: "1" } }) });
    const data = await api("/auth/login", { method: "POST", body: { email: "a@b.c", password: "x" } });
    expect(data).toEqual({ user: { id: "1" } });
    const [, init] = fetch.mock.calls[0];
    expect(init.credentials).toBe("same-origin");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.c", password: "x" });
  });

  it("returns null for 204", async () => {
    mockApi({ "POST /api/auth/logout": () => new Response(null, { status: 204 }) });
    expect(await api("/auth/logout", { method: "POST" })).toBeNull();
  });

  it("turns { error } bodies into ApiError with code and details", async () => {
    mockApi({ "POST /api/auth/verify-email": () => json(400, { error: { code: "OTP_INVALID", message: "Wrong code", details: { attemptsLeft: 2 } } }) });
    const err = await api("/auth/verify-email", { method: "POST", body: { code: "000000" } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: "OTP_INVALID", details: { attemptsLeft: 2 } });
  });

  it("reports a network failure as NETWORK_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const err = await api("/auth/me").catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("calls the auth handlers for 401, PASSWORD_CHANGE_REQUIRED and ACCOUNT_DEACTIVATED", async () => {
    const onUnauthenticated = vi.fn();
    const onPasswordChangeRequired = vi.fn();
    const onDeactivated = vi.fn();
    setAuthHandlers({ onUnauthenticated, onPasswordChangeRequired, onDeactivated });
    mockApi({
      "GET /api/a": () => json(401, { error: { code: "SESSION_EXPIRED" } }),
      "GET /api/b": () => json(403, { error: { code: "PASSWORD_CHANGE_REQUIRED" } }),
      "GET /api/c": () => json(403, { error: { code: "ACCOUNT_DEACTIVATED" } }),
      "GET /api/d": () => json(403, { error: { code: "FORBIDDEN" } }),
    });
    for (const p of ["/a", "/b", "/c", "/d"]) await api(p).catch(() => {});
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(onPasswordChangeRequired).toHaveBeenCalledTimes(1);
    expect(onDeactivated).toHaveBeenCalledTimes(1);
  });

  it("does not redirect when authRedirect is false (e.g. a wrong password on login)", async () => {
    const onUnauthenticated = vi.fn();
    setAuthHandlers({ onUnauthenticated });
    mockApi({ "POST /api/auth/login": () => json(401, { error: { code: "INVALID_CREDENTIALS" } }) });
    await api("/auth/login", { method: "POST", body: {}, authRedirect: false }).catch(() => {});
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});

describe("fieldErrors()", () => {
  it("maps VALIDATION_FAILED issues to fields", () => {
    const err = new ApiError(400, "VALIDATION_FAILED", "Invalid", {
      issues: [
        { location: "body", path: "email", message: "bad" },
        { location: "body", path: "phone", message: "short" },
      ],
    });
    expect(fieldErrors(err)).toEqual({ email: "bad", phone: "short" });
    expect(fieldErrors(new ApiError(400, "OTHER"))).toEqual({});
  });
});
