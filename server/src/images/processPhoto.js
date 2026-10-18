// Turns an uploaded file into the two copies we store:
//   original – exactly what was uploaded (private: admins / assignee only)
//   public   – rotated upright, max 1600 px, re-encoded as JPEG with ALL metadata removed (no EXIF/GPS)
// The file type is decided from the file's content (magic bytes), never from its name or header.
import crypto from "node:crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { AppError } from "../lib/AppError.js";

export const ALLOWED_TYPES = Object.freeze({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" });
export const PUBLIC_MAX_PX = 1600;
const MIN_PX = 200;

export async function processPhoto(buffer) {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !ALLOWED_TYPES[type.mime]) {
    throw new AppError(415, "UNSUPPORTED_IMAGE", "Upload a JPEG, PNG or WebP photo");
  }

  let meta;
  try {
    meta = await sharp(buffer, { failOn: "error" }).metadata();
  } catch {
    throw new AppError(422, "UNREADABLE_IMAGE", "This photo could not be read. Take it again");
  }
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < MIN_PX) {
    throw new AppError(422, "IMAGE_TOO_SMALL", `The photo must be at least ${MIN_PX} px on each side`);
  }

  let publicBuffer;
  try {
    // sharp drops all metadata unless asked to keep it, so the output has no EXIF/GPS.
    publicBuffer = await sharp(buffer, { failOn: "error" })
      .rotate()
      .resize({ width: PUBLIC_MAX_PX, height: PUBLIC_MAX_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError(422, "UNREADABLE_IMAGE", "This photo could not be read. Take it again");
  }

  return {
    mimeType: type.mime,
    ext: ALLOWED_TYPES[type.mime],
    width: meta.width,
    height: meta.height,
    sizeBytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    original: buffer,
    public: publicBuffer.data,
  };
}
