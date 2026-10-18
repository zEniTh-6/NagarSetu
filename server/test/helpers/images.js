// Test images generated on the fly (real-photo fixtures for the AI live check are separate).
import sharp from "sharp";

/** A JPEG "camera photo" with EXIF including GPS, like a phone would produce. */
export function cameraJpeg({ width = 1200, height = 900 } = {}) {
  return sharp({ create: { width, height, channels: 3, background: { r: 96, g: 96, b: 90 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestPhone", Model: "NS-1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "16/1 51/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "74/1 34/1 0/1" },
    })
    .toBuffer();
}

export const png = ({ width = 600, height = 600 } = {}) =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 30 } } }).png().toBuffer();

export const tinyJpeg = () => sharp({ create: { width: 40, height: 40, channels: 3, background: "#888" } }).jpeg().toBuffer();

/** A text file pretending to be a JPEG (right name and header, wrong content). */
export const fakeJpeg = () => Buffer.from("this is not an image, just text pretending to be photo.jpg\n".repeat(20));
