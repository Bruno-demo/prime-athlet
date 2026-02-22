import "server-only";

import { Collection } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";
import { getShippingConfigFromEnv, type ShippingConfig } from "@/lib/shipping";

interface ShippingSettingsDocument {
  key: "shipping";
  flatRateCents: number;
  freeShippingThresholdCents: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

declare global {
  var _shippingSettingsCache:
    | {
        config: ShippingConfig;
        expiresAtMs: number;
      }
    | undefined;
}

const DEFAULT_SETTINGS_CACHE_TTL_MS = 60_000;

function parsePositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function toSafeNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(Math.floor(value), 0);
}

function toNormalizedShippingConfig(
  input: Partial<ShippingConfig> | null | undefined,
  fallback: ShippingConfig,
): ShippingConfig {
  return {
    flatRateCents: toSafeNonNegativeInt(input?.flatRateCents, fallback.flatRateCents),
    freeShippingThresholdCents: toSafeNonNegativeInt(
      input?.freeShippingThresholdCents,
      fallback.freeShippingThresholdCents,
    ),
  };
}

function getCacheTtlMs(): number {
  return parsePositiveIntEnv(
    "SHIPPING_SETTINGS_CACHE_TTL_MS",
    DEFAULT_SETTINGS_CACHE_TTL_MS,
  );
}

async function getShippingSettingsCollection(): Promise<
  Collection<ShippingSettingsDocument> | null
> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<ShippingSettingsDocument>(
    process.env.MONGODB_SETTINGS_COLLECTION || "settings",
  );
  await collection.createIndex({ key: 1 }, { unique: true });
  return collection;
}

function setCachedShippingConfig(config: ShippingConfig): void {
  global._shippingSettingsCache = {
    config,
    expiresAtMs: Date.now() + getCacheTtlMs(),
  };
}

export function clearShippingSettingsCache(): void {
  global._shippingSettingsCache = undefined;
}

export async function getShippingSettings(): Promise<ShippingConfig> {
  const envConfig = getShippingConfigFromEnv();
  const cached = global._shippingSettingsCache;
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.config;
  }

  const collection = await getShippingSettingsCollection();
  if (!collection) {
    setCachedShippingConfig(envConfig);
    return envConfig;
  }

  try {
    const doc = await collection.findOne({ key: "shipping" });
    const config = toNormalizedShippingConfig(doc, envConfig);
    setCachedShippingConfig(config);
    return config;
  } catch {
    setCachedShippingConfig(envConfig);
    return envConfig;
  }
}

export async function updateShippingSettings(params: {
  flatRateCents: number;
  freeShippingThresholdCents: number;
  actorEmail?: string | null;
}): Promise<ShippingConfig> {
  const collection = await getShippingSettingsCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for shipping settings.");
  }

  const envConfig = getShippingConfigFromEnv();
  const nextConfig = toNormalizedShippingConfig(
    {
      flatRateCents: params.flatRateCents,
      freeShippingThresholdCents: params.freeShippingThresholdCents,
    },
    envConfig,
  );

  const now = new Date();
  await collection.updateOne(
    { key: "shipping" },
    {
      $set: {
        key: "shipping",
        flatRateCents: nextConfig.flatRateCents,
        freeShippingThresholdCents: nextConfig.freeShippingThresholdCents,
        updatedAt: now,
        updatedBy: params.actorEmail?.trim().toLowerCase() || null,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  setCachedShippingConfig(nextConfig);
  return nextConfig;
}
