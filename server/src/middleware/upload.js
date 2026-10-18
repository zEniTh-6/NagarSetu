// Multipart upload of ONE photo, kept in memory (max MAX_UPLOAD_MB) and checked by processPhoto.
import multer from "multer";
import { env } from "../config/env.js";

export const singlePhoto = (field = "photo") =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 20, fieldSize: 16 * 1024 },
  }).single(field);
