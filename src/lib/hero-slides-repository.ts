import "server-only";

import { Collection } from "mongodb";

import { Product, ProductImage } from "@/lib/catalog";
import { HomeHeroSlide, HeroSlideRecord } from "@/lib/hero-slides";
import { getPrimaryProductImage } from "@/lib/image-utils";
import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

interface HeroSlideDocument {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  image: ProductImage;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HeroSlideUpsertInput {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  image: ProductImage;
  isActive: boolean;
  sortOrder: number;
}

let heroSlidesIndexesReady = false;

function byStableHomeOrder(left: Product, right: Product): number {
  return left.id.localeCompare(right.id);
}

function toSafeDate(value: unknown): Date | null {
  if (!(value instanceof Date)) {
    return null;
  }
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return value;
}

function toSafeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toSafeImage(value: unknown): ProductImage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ProductImage>;
  if (typeof candidate.src !== "string" || candidate.src.trim().length === 0) {
    return null;
  }

  const alt =
    typeof candidate.alt === "string" && candidate.alt.trim().length > 0
      ? candidate.alt.trim()
      : "Hero slide image";

  return {
    src: candidate.src.trim(),
    alt,
    width:
      typeof candidate.width === "number" && candidate.width > 0
        ? Math.floor(candidate.width)
        : undefined,
    height:
      typeof candidate.height === "number" && candidate.height > 0
        ? Math.floor(candidate.height)
        : undefined,
  };
}

function toSafeSortOrder(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(Math.max(Math.floor(value), 0), 10_000);
}

function toHeroSlideRecord(
  doc: Partial<HeroSlideDocument> | null | undefined,
): HeroSlideRecord | null {
  if (!doc) {
    return null;
  }

  const id = toSafeString(doc.id);
  const title = toSafeString(doc.title);
  const subtitle = toSafeString(doc.subtitle);
  const badge = toSafeString(doc.badge);
  const href = toSafeString(doc.href);
  const image = toSafeImage(doc.image);
  const sortOrder = toSafeSortOrder(doc.sortOrder);
  const createdAt = toSafeDate(doc.createdAt);
  const updatedAt = toSafeDate(doc.updatedAt);

  if (
    !id ||
    !title ||
    !subtitle ||
    !badge ||
    !href ||
    !image ||
    sortOrder === null ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    title,
    subtitle,
    badge,
    href,
    image,
    isActive: Boolean(doc.isActive),
    sortOrder,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function toHomeHeroSlide(slide: HeroSlideRecord): HomeHeroSlide {
  return {
    id: slide.id,
    title: slide.title,
    subtitle: slide.subtitle,
    badge: slide.badge,
    href: slide.href,
    image: slide.image,
  };
}

function normalizeProductList(products: Product[] | undefined): Product[] {
  if (Array.isArray(products) && products.length > 0) {
    return products.slice();
  }
  return [];
}

function buildFallbackHomeHeroSlides(products?: Product[]): HomeHeroSlide[] {
  const sourceProducts = normalizeProductList(products);
  sourceProducts.sort(byStableHomeOrder);

  return sourceProducts.slice(0, 5).map((product, index) => ({
    id: product.id,
    title:
      index % 2 === 0
        ? `${product.sport} Weekend Deals`
        : `Level Up Your ${product.sport} Season`,
    subtitle: `${product.name} and related gear now available with limited-time pricing and fast shipping.`,
    badge: product.badge,
    href: `/shop/${product.id}`,
    image: getPrimaryProductImage(product),
  }));
}

async function getHeroSlidesCollection(): Promise<Collection<HeroSlideDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<HeroSlideDocument>(
    process.env.MONGODB_HERO_SLIDES_COLLECTION || "hero_slides",
  );
  if (!heroSlidesIndexesReady) {
    await collection.createIndex({ id: 1 }, { unique: true });
    await collection.createIndex({ isActive: 1, sortOrder: 1, updatedAt: -1 });
    await collection.createIndex({ updatedAt: -1 });
    heroSlidesIndexesReady = true;
  }

  return collection;
}

export async function getAdminHeroSlides(): Promise<HeroSlideRecord[]> {
  try {
    const collection = await getHeroSlidesCollection();
    if (!collection) {
      return [];
    }

    const docs = await collection
      .find({})
      .sort({ sortOrder: 1, updatedAt: -1, id: 1 })
      .toArray();
    return docs
      .map((doc) => toHeroSlideRecord(doc))
      .filter((slide): slide is HeroSlideRecord => slide !== null);
  } catch {
    return [];
  }
}

export async function getHomeHeroSlides(options?: {
  fallbackProducts?: Product[];
}): Promise<HomeHeroSlide[]> {
  const adminSlides = await getAdminHeroSlides();
  const activeSlides = adminSlides
    .filter((slide) => slide.isActive)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.id.localeCompare(right.id);
    });

  if (activeSlides.length > 0) {
    return activeSlides.map((slide) => toHomeHeroSlide(slide));
  }
  if (adminSlides.length > 0) {
    return [];
  }

  return buildFallbackHomeHeroSlides(options?.fallbackProducts);
}

export async function upsertHeroSlide(
  input: HeroSlideUpsertInput,
): Promise<HeroSlideRecord> {
  const collection = await getHeroSlidesCollection();
  if (!collection) {
    throw new Error("Hero slides collection is unavailable.");
  }

  const now = new Date();
  const id = input.id.trim();
  const title = input.title.trim();
  const subtitle = input.subtitle.trim();
  const badge = input.badge.trim();
  const href = input.href.trim();
  const image: ProductImage = {
    src: input.image.src.trim(),
    alt: input.image.alt.trim(),
    width:
      typeof input.image.width === "number" && input.image.width > 0
        ? Math.floor(input.image.width)
        : undefined,
    height:
      typeof input.image.height === "number" && input.image.height > 0
        ? Math.floor(input.image.height)
        : undefined,
  };
  const sortOrder = Math.min(Math.max(Math.floor(input.sortOrder), 0), 10_000);
  const isActive = Boolean(input.isActive);

  await collection.updateOne(
    { id },
    {
      $set: {
        title,
        subtitle,
        badge,
        href,
        image,
        sortOrder,
        isActive,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const saved = await collection.findOne({ id });
  const mapped = toHeroSlideRecord(saved);
  if (!mapped) {
    throw new Error("Unable to load saved hero slide.");
  }
  return mapped;
}

export async function deleteHeroSlideById(id: string): Promise<void> {
  const collection = await getHeroSlidesCollection();
  if (!collection) {
    throw new Error("Hero slides collection is unavailable.");
  }

  await collection.deleteOne({ id: id.trim() });
}
