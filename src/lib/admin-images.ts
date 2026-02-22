import "server-only";

import path from "node:path";
import { access, readFile } from "node:fs/promises";

import { readImageDimensions } from "@/lib/image-dimensions";

export interface LocalImageMetadata {
  src: string;
  width: number;
  height: number;
  sizeBytes: number;
  format: "jpeg" | "png";
}

function normalizePublicSrc(src: string): string {
  const normalized = path.posix.normalize(src.replace(/\\/g, "/"));
  if (!normalized.startsWith("/")) {
    return `/${normalized}`;
  }
  return normalized;
}

export function resolvePublicImageLocalPath(src: string): string | null {
  const normalizedSrc = normalizePublicSrc(src);
  if (!normalizedSrc.startsWith("/products/")) {
    return null;
  }
  if (normalizedSrc.includes("..")) {
    return null;
  }

  return path.join(
    process.cwd(),
    "public",
    normalizedSrc.replace(/^\/+/, "").split("/").join(path.sep),
  );
}

export async function readLocalImageMetadata(
  src: string,
): Promise<LocalImageMetadata | null> {
  const normalizedSrc = normalizePublicSrc(src);
  const localPath = resolvePublicImageLocalPath(normalizedSrc);
  if (!localPath) {
    return null;
  }

  try {
    await access(localPath);
    const buffer = await readFile(localPath);
    const dimensions = readImageDimensions(buffer);
    if (!dimensions) {
      return null;
    }

    return {
      src: normalizedSrc,
      width: dimensions.width,
      height: dimensions.height,
      sizeBytes: buffer.byteLength,
      format: dimensions.format,
    };
  } catch {
    return null;
  }
}
