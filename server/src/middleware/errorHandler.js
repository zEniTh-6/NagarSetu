// Central error handler. Clients get { error: { code, message, details? } } and never a stack trace.
import multer from "multer";
import { AppError } from "../lib/AppError.js";

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, "NOT_FOUND", "Not found"));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { code: "INTERNAL_ERROR", message: "Something went wrong" };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) };
  } else if (err instanceof multer.MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    body =
      err.code === "LIMIT_FILE_SIZE"
        ? { code: "PHOTO_TOO_LARGE", message: "The photo is too large" }
        : { code: "BAD_UPLOAD", message: "Send one photo in the \"photo\" field" };
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    body = { code: "MALFORMED_JSON", message: "Request body is not valid JSON" };
  } else if (err?.type === "entity.too.large") {
    status = 413;
    body = { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
  } else if (err?.type === "charset.unsupported" || err?.type === "encoding.unsupported") {
    status = 415;
    body = { code: "UNSUPPORTED_ENCODING", message: "Unsupported request encoding" };
  }

  if (status >= 500) {
    // Full detail stays in the server log only.
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }
  if (res.headersSent) return;
  res.status(status).json({ error: body });
}
