import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { Product } from "@/lib/catalog";
import { HomeHeroSlide } from "@/lib/hero-slides";
import { getHomeHeroSlides } from "@/lib/hero-slides-repository";
import {
  getAllProducts,
  resolveProductIdAlias,
} from "@/lib/products-repository";
import { getTaxonomyValues, TaxonomyType } from "@/lib/taxonomy-repository";

const STOREFRONT_CACHE_REVALIDATE_SECONDS = Math.min(
  Math.max(Number(process.env.STOREFRONT_CACHE_REVALIDATE_SECONDS || 90), 15),
  600,
);

export const STOREFRONT_PRODUCTS_TAG = "storefront:products";
export const STOREFRONT_TAXONOMY_TAG = "storefront:taxonomy";
export const STOREFRONT_HERO_TAG = "storefront:hero";

const getCachedStorefrontProductsInternal = unstable_cache(
  async (): Promise<Product[]> => {
    return getAllProducts();
  },
  ["storefront-products-v1"],
  {
    revalidate: STOREFRONT_CACHE_REVALIDATE_SECONDS,
    tags: [STOREFRONT_PRODUCTS_TAG],
  },
);

const getCachedStorefrontSportsInternal = unstable_cache(
  async (): Promise<string[]> => {
    return getTaxonomyValues("sport");
  },
  ["storefront-taxonomy-sport-v1"],
  {
    revalidate: STOREFRONT_CACHE_REVALIDATE_SECONDS,
    tags: [STOREFRONT_TAXONOMY_TAG],
  },
);

const getCachedStorefrontCategoriesInternal = unstable_cache(
  async (): Promise<string[]> => {
    return getTaxonomyValues("category");
  },
  ["storefront-taxonomy-category-v1"],
  {
    revalidate: STOREFRONT_CACHE_REVALIDATE_SECONDS,
    tags: [STOREFRONT_TAXONOMY_TAG],
  },
);

const getCachedStorefrontHeroSlidesInternal = unstable_cache(
  async (): Promise<HomeHeroSlide[]> => {
    const products = await getCachedStorefrontProductsInternal();
    return getHomeHeroSlides({ fallbackProducts: products });
  },
  ["storefront-hero-v1"],
  {
    revalidate: STOREFRONT_CACHE_REVALIDATE_SECONDS,
    tags: [STOREFRONT_HERO_TAG, STOREFRONT_PRODUCTS_TAG],
  },
);

export async function getCachedStorefrontProducts(): Promise<Product[]> {
  return getCachedStorefrontProductsInternal();
}

export async function getCachedStorefrontProductById(
  productId: string,
): Promise<Product | null> {
  const normalizedId = resolveProductIdAlias(productId);
  const products = await getCachedStorefrontProductsInternal();
  const product = products.find((candidate) => candidate.id === normalizedId);
  return product || null;
}

export async function getCachedStorefrontTaxonomyValues(
  type: TaxonomyType,
): Promise<string[]> {
  if (type === "sport") {
    return getCachedStorefrontSportsInternal();
  }
  return getCachedStorefrontCategoriesInternal();
}

export async function getCachedStorefrontHeroSlides(): Promise<HomeHeroSlide[]> {
  return getCachedStorefrontHeroSlidesInternal();
}

export function revalidateStorefrontCaches(): void {
  revalidateTag(STOREFRONT_PRODUCTS_TAG, "max");
  revalidateTag(STOREFRONT_TAXONOMY_TAG, "max");
  revalidateTag(STOREFRONT_HERO_TAG, "max");
}
