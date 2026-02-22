import "server-only";

import { Collection } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

const DEFAULT_COMPARE_COLLECTION = "compare_lists";
const MAX_COMPARE_ITEMS = 4;

interface CompareDocument {
  userId: string;
  productIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

function normalizeProductIds(productIds: string[]): string[] {
  return Array.from(
    new Set(
      productIds
        .map((productId) => productId.trim())
        .filter((productId) => productId.length > 0),
    ),
  ).slice(0, MAX_COMPARE_ITEMS);
}

async function getCompareCollection(): Promise<Collection<CompareDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<CompareDocument>(
    process.env.MONGODB_COMPARE_COLLECTION || DEFAULT_COMPARE_COLLECTION,
  );

  await collection.createIndex({ userId: 1 }, { unique: true });
  await collection.createIndex({ updatedAt: -1 });

  return collection;
}

export async function getCompareProductIdsByUserId(
  userId: string,
): Promise<string[]> {
  const collection = await getCompareCollection();
  if (!collection) {
    return [];
  }

  const document = await collection.findOne({ userId });
  if (!document) {
    return [];
  }

  return normalizeProductIds(document.productIds);
}

export async function setCompareProductIds(
  userId: string,
  productIds: string[],
): Promise<string[]> {
  const collection = await getCompareCollection();
  if (!collection) {
    return [];
  }

  const normalizedProductIds = normalizeProductIds(productIds);
  const now = new Date();

  await collection.updateOne(
    { userId },
    {
      $set: {
        productIds: normalizedProductIds,
        updatedAt: now,
      },
      $setOnInsert: {
        userId,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return normalizedProductIds;
}

export async function addCompareProduct(
  userId: string,
  productId: string,
): Promise<string[]> {
  const existingIds = await getCompareProductIdsByUserId(userId);
  const normalizedProductId = productId.trim();

  if (!normalizedProductId) {
    return existingIds;
  }

  if (existingIds.includes(normalizedProductId)) {
    return existingIds;
  }

  if (existingIds.length >= MAX_COMPARE_ITEMS) {
    return existingIds;
  }

  return setCompareProductIds(userId, [...existingIds, normalizedProductId]);
}

export async function removeCompareProduct(
  userId: string,
  productId: string,
): Promise<string[]> {
  const normalizedProductId = productId.trim();
  const existingIds = await getCompareProductIdsByUserId(userId);

  if (!normalizedProductId) {
    return existingIds;
  }

  return setCompareProductIds(
    userId,
    existingIds.filter((id) => id !== normalizedProductId),
  );
}
