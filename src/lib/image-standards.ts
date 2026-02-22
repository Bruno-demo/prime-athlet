export type ImagePreset = "product" | "hero" | "category";

interface ImagePresetConfig {
  key: ImagePreset;
  label: string;
  exactWidth: number;
  exactHeight: number;
  maxFileSizeBytes: number;
  acceptedMimeTypes: readonly string[];
}

export const IMAGE_PRESETS: Record<ImagePreset, ImagePresetConfig> = {
  product: {
    key: "product",
    label: "Product Gallery",
    exactWidth: 1600,
    exactHeight: 1600,
    maxFileSizeBytes: 4 * 1024 * 1024,
    acceptedMimeTypes: ["image/jpeg", "image/png"],
  },
  hero: {
    key: "hero",
    label: "Home Hero",
    exactWidth: 1920,
    exactHeight: 880,
    maxFileSizeBytes: 6 * 1024 * 1024,
    acceptedMimeTypes: ["image/jpeg", "image/png"],
  },
  category: {
    key: "category",
    label: "Category Banner",
    exactWidth: 1200,
    exactHeight: 900,
    maxFileSizeBytes: 4 * 1024 * 1024,
    acceptedMimeTypes: ["image/jpeg", "image/png"],
  },
};

export function isKnownImagePreset(value: string): value is ImagePreset {
  return value === "product" || value === "hero" || value === "category";
}

export function matchesExactImagePreset(
  preset: ImagePreset,
  width: number,
  height: number,
): boolean {
  const config = IMAGE_PRESETS[preset];
  return width === config.exactWidth && height === config.exactHeight;
}

export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
