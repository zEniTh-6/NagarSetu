// One fetch wrapper for the NagarSetu API.
// The session JWT is an httpOnly cookie set by the server; the web app never sees or stores it.
// Vite proxies /api to the server, so requests are same-origin and the cookie is sent automatically.

export const API_BASE = "/api";

/** Error from the API ({ error: { code, message, details } }) or from the network. */
export class ApiError extends Error {
  constructor(status, code, message = code, details = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Set once by the app (see auth/AuthEvents.jsx). Kept outside React so any request can use them.
const handlers = {
  onUnauthenticated: null,
  onPasswordChangeRequired: null,
  onDeactivated: null,
};

export function setAuthHandlers(next) {
  Object.assign(handlers, next);
}

/**
 * @param {string} path  path below /api, e.g. "/auth/me"
 * @param {object} [opts]
 * @param {string} [opts.method]
 * @param {unknown} [opts.body] sent as JSON
 * @param {FormData} [opts.form] sent as multipart (photo uploads); the browser sets the boundary
 * @param {AbortSignal} [opts.signal]
 * @param {boolean} [opts.authRedirect=true] false on login/signup/etc.: their 401/403 are answers, not "session gone"
 */
export async function api(path, { method = "GET", body, form, signal, authRedirect = true } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server");
  }

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (res.ok) return data;

  const e = data?.error;
  const err = new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? res.statusText, e?.details);

  if (authRedirect) {
    if (res.status === 401) handlers.onUnauthenticated?.(err);
    else if (err.code === "PASSWORD_CHANGE_REQUIRED") handlers.onPasswordChangeRequired?.(err);
    else if (err.code === "ACCOUNT_DEACTIVATED") handlers.onDeactivated?.(err);
  }
  throw err;
}

/** Field errors from a VALIDATION_FAILED response: { email: "must be …" }. */
export function fieldErrors(err) {
  if (!(err instanceof ApiError) || err.code !== "VALIDATION_FAILED") return {};
  const out = {};
  for (const issue of err.details?.issues ?? []) {
    const key = issue.path || issue.location;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
