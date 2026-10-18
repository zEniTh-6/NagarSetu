// Errors that are safe to show to the client. Anything else becomes a generic 500.
export class AppError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code   stable machine-readable code (the web app translates it)
   * @param {string} [message] short English message for developers
   * @param {object} [details] extra safe data (e.g. validation issues)
   */
  constructor(status, code, message = code, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (code = "NOT_FOUND") => new AppError(404, code, "Not found");
export const forbidden = (code = "FORBIDDEN") => new AppError(403, code, "Forbidden");
