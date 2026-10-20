// Mirrors the server's password rule (server/src/auth/password.js): 8+ characters, at most 72 bytes.
import { PASSWORD_MAX_BYTES, PASSWORD_MIN } from "../api/auth.js";

export function passwordProblem(password) {
  if (password.length < PASSWORD_MIN) return "tooShort";
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "tooLong";
  return null;
}

/** Translated error for a new password + its confirmation, or {} when both are fine. */
export function newPasswordErrors(t, password, confirm) {
  const errors = {};
  const problem = passwordProblem(password);
  if (problem) errors.newPassword = t(`password.${problem}`, { min: PASSWORD_MIN });
  if (confirm !== password) errors.confirm = t("password.mismatch");
  return errors;
}
