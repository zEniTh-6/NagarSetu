// Shared retry rule for uploads (citizen reports, contractor evidence): only a lost connection or a
// server error is retried, after 2, 4, 8, 15, then every 30 s. The same clientRequestId is sent every
// time, so the server can never create two records.
import { ApiError } from "../api/client.js";

export const RETRY_DELAYS_S = [2, 4, 8, 15, 30];
export const retryable = (err) => err instanceof ApiError && (err.code === "NETWORK_ERROR" || err.status >= 500);
export const retryDelay = (attempt) => RETRY_DELAYS_S[Math.min(attempt - 1, RETRY_DELAYS_S.length - 1)];
