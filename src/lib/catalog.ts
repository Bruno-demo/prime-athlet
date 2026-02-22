export type ProductTone = "field" | "court" | "street" | "fitness" | "outdoor";

export interface Product {
  id: string;
  name: string;
  sport: string;
  category: string;
  priceCents: number;
  brand?: string;
  sku?: string;
  stockQuantity?: number;
  compareAtPriceCents?: number | null;
  tags?: string[];
  sizes?: string[];
  colors?: string[];
  rating: number;
  reviews: number;
  badge: string;
  description: string;
  tone: ProductTone;
  images: ProductImage[];
}

export interface ProductImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export const productToneClasses: Record<ProductTone, string> = {
  field: "from-[var(--tone-field-from)] to-[var(--tone-field-to)]",
  court: "from-[var(--tone-court-from)] to-[var(--tone-court-to)]",
  street: "from-[var(--tone-street-from)] to-[var(--tone-street-to)]",
  fitness: "from-[var(--tone-fitness-from)] to-[var(--tone-fitness-to)]",
  outdoor: "from-[var(--tone-outdoor-from)] to-[var(--tone-outdoor-to)]",
};

const PRODUCT_IMAGE_PATH_PATTERN =
  /^\/products\/[A-Za-z0-9][A-Za-z0-9/_-]*\.(jpe?g|png|webp)$/i;

export function isKnownProductImagePath(src: string): boolean {
  return PRODUCT_IMAGE_PATH_PATTERN.test(src);
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatPrice(priceCents: number): string {
  return usdFormatter.format(priceCents / 100);
}

function toDistinctOptions(options: string[]): string[] {
  return Array.from(
    new Set(options.map((item) => item.trim()).filter(Boolean)),
  ).slice(0, 12);
}

export function getDefaultProductSizes(category: string): string[] {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("footwear") || normalized.includes("shoe")) {
    return ["US 7", "US 8", "US 9", "US 10", "US 11"];
  }
  if (normalized.includes("apparel") || normalized.includes("jersey")) {
    return ["S", "M", "L", "XL"];
  }
  return ["One Size"];
}

export function getDefaultProductColors(
  sport: string,
  category: string,
): string[] {
  const byCategory = category.trim().toLowerCase();
  if (byCategory.includes("footwear")) {
    return ["White", "Black", "Gray"];
  }
  if (byCategory.includes("apparel") || byCategory.includes("jersey")) {
    return ["Black", "White", "Navy", "Red"];
  }
  const bySport = sport.trim().toLowerCase();
  if (bySport.includes("running")) {
    return ["Black", "White", "Neon"];
  }
  return ["Black", "White", "Blue"];
}

export function normalizeProductOptionList(
  value: unknown,
  fallback: string[],
): string[] {
  const fromArray = Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];
  if (fromArray.length === 0) {
    return toDistinctOptions(fallback);
  }
  return toDistinctOptions(fromArray);
}
