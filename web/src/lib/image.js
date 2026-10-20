// Client-side photo resize before upload: smaller uploads on mobile data, same picture.
// The server still checks the type from the bytes, strips EXIF/GPS from public copies and resizes again.

export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.85;
export const MIN_EDGE = 200; // server: IMAGE_TOO_SMALL below this

/** Size that fits inside max × max, keeping the aspect ratio; never upscales. */
export function fitWithin(width, height, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export class PhotoError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // NOT_AN_IMAGE | UNREADABLE | TOO_SMALL
  }
}

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" applies the camera's EXIF rotation.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Resizes a camera/gallery file to a JPEG of at most MAX_EDGE px on the long side.
 * capturedAt is the file's date (a hint only; EXIF is not proof of freshness).
 * @returns {Promise<{ blob: Blob, width: number, height: number, capturedAt: number|null }>}
 */
export async function preparePhoto(file) {
  if (!file || !file.type?.startsWith("image/")) throw new PhotoError("NOT_AN_IMAGE");
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new PhotoError("UNREADABLE");
  }
  const w = source.width;
  const h = source.height;
  if (!w || !h) throw new PhotoError("UNREADABLE");
  if (Math.min(w, h) < MIN_EDGE) throw new PhotoError("TOO_SMALL");

  const size = fitWithin(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("UNREADABLE");
  ctx.drawImage(source, 0, 0, size.width, size.height);
  source.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new PhotoError("UNREADABLE");
  return { blob, width: size.width, height: size.height, capturedAt: file.lastModified || null };
}
