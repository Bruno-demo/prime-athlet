import "server-only";

import { Collection } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

interface WishlistDocument {
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
  );
}

async function getWishlistsCollection(): Promise<Collection<WishlistDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<WishlistDocument>(
    process.env.MONGODB_WISHLISTS_COLLECTION || "wishlists",
  );

  await collection.createIndex({ userId: 1 }, { unique: true });
  await collection.createIndex({ updatedAt: -1 });

  return collection;
}

export async function getWishlistProductIdsByUserId(
  userId: string,
): Promise<string[]> {
  const collection = await getWishlistsCollection();
  if (!collection) {
    return [];
  }

  const document = await collection.findOne({ userId });
  if (!document) {
    return [];
  }

  return normalizeProductIds(document.productIds);
}

export async function addWishlistProduct(
  userId: string,
  productId: string,
): Promise<string[]> {
  const collection = await getWishlistsCollection();
  if (!collection) {
    return [];
  }

  const normalizedProductId = productId.trim();
  if (normalizedProductId.length === 0) {
    return getWishlistProductIdsByUserId(userId);
  }

  const now = new Date();
  await collection.updateOne(
    { userId },
    {
      $addToSet: {
        productIds: normalizedProductId,
      },
      $set: {
        updatedAt: now,
      },
      $setOnInsert: {
        userId,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return getWishlistProductIdsByUserId(userId);
}

export async function removeWishlistProduct(
  userId: string,
  productId: string,
): Promise<string[]> {
  const collection = await getWishlistsCollection();
  if (!collection) {
    return [];
  }

  const normalizedProductId = productId.trim();
  if (normalizedProductId.length === 0) {
    return getWishlistProductIdsByUserId(userId);
  }

  await collection.updateOne(
    { userId },
    {
      $pull: {
        productIds: normalizedProductId,
      },
      $set: {
        updatedAt: new Date(),
      },
    },
  );

  return getWishlistProductIdsByUserId(userId);
}
