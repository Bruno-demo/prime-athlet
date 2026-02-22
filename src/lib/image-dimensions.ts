import "server-only";

export interface ImageDimensions {
  width: number;
  height: number;
  format: "jpeg" | "png";
}

function parsePngDimensions(buffer: Buffer): ImageDimensions | null {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    return null;
  }

  const ihdr = buffer.toString("ascii", 12, 16);
  if (ihdr !== "IHDR") {
    return null;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height, format: "png" };
}

function parseJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 1 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) {
      offset += 1;
    }
    if (offset + 1 >= buffer.length) {
      break;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buffer.length) {
      break;
    }

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }
    if (marker === 0xda) {
      break;
    }

    if (offset + 1 >= buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2) {
      return null;
    }

    const segmentStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > buffer.length) {
      return null;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      if (segmentStart + 5 >= buffer.length) {
        return null;
      }

      const height = buffer.readUInt16BE(segmentStart + 1);
      const width = buffer.readUInt16BE(segmentStart + 3);
      if (width <= 0 || height <= 0) {
        return null;
      }
      return { width, height, format: "jpeg" };
    }

    offset = segmentEnd;
  }

  return null;
}

export function readImageDimensions(buffer: Buffer): ImageDimensions | null {
  return parsePngDimensions(buffer) ?? parseJpegDimensions(buffer);
}
