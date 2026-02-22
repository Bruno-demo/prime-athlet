import { ProductImage } from "@/lib/catalog";

export const DEFAULT_PRODUCT_IMAGE_SRC = "/products/photo-01.jpg";
export const DEFAULT_IMAGE_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYwMCcgaGVpZ2h0PSc4MDBnJyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnPjxyZWN0IHdpZHRoPScxNjAwJyBoZWlnaHQ9JzgwMCcgZmlsbD0nI2UwZTVlYicvPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0nZycgeDE9JzAnIHkxPScwJyB4Mj0nMScgeTI9JzEnPjxzdG9wIHN0b3AtY29sb3I9JyNkZmU2ZWYnIG9mZnNldD0nMCcvPjxzdG9wIHN0b3AtY29sb3I9JyNlZWYzZjknIG9mZnNldD0nMScvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPScxNjAwJyBoZWlnaHQ9JzgwMCcgZmlsbD0ndXJsKCNnKScgb3BhY2l0eT0nMC43NScvPjwvc3ZnPg==";

interface ProductLike {
  name?: string;
  images?: Array<Partial<ProductImage> | null | undefined>;
}

function resolveFallbackAlt(productName?: string): string {
  const normalizedName = (productName || "").trim();
  return normalizedName.length > 0
    ? `${normalizedName} image`
    : "Prime Athlete product image";
}

function toSafeProductImage(
  image: Partial<ProductImage> | null | undefined,
  fallbackAlt: string,
): ProductImage | null {
  if (!image || typeof image.src !== "string") {
    return null;
  }

  const src = image.src.trim();
  if (!src) {
    return null;
  }

  return {
    src,
    alt:
      typeof image.alt === "string" && image.alt.trim().length > 0
        ? image.alt.trim()
        : fallbackAlt,
    width:
      typeof image.width === "number" && image.width > 0
        ? Math.floor(image.width)
        : undefined,
    height:
      typeof image.height === "number" && image.height > 0
        ? Math.floor(image.height)
        : undefined,
  };
}

export function getPrimaryProductImage(product: ProductLike): ProductImage {
  const fallbackAlt = resolveFallbackAlt(product.name);
  const primary = toSafeProductImage(product.images?.[0], fallbackAlt);
  if (primary) {
    return primary;
  }

  return {
    src: DEFAULT_PRODUCT_IMAGE_SRC,
    alt: fallbackAlt,
  };
}

export function getProductImageAt(
  product: ProductLike,
  index: number,
): ProductImage {
  const fallbackAlt = resolveFallbackAlt(product.name);
  const imageAtIndex = toSafeProductImage(product.images?.[index], fallbackAlt);
  if (imageAtIndex) {
    return imageAtIndex;
  }

  return getPrimaryProductImage(product);
}
