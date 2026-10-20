// Turns an API error into translated text. The server's English `message` is never shown.
import { ApiError } from "../api/client.js";

export function errorText(t, i18n, err) {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    if (i18n.exists(key)) return t(key, err.details ?? {});
    if (err.status === 429) return t("errors.RATE_LIMITED");
    if (err.status >= 500) return t("errors.INTERNAL_ERROR");
  }
  return t("errors.UNKNOWN");
}
