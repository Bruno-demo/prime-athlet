import "server-only";

import { Collection, ObjectId } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

export type TaxonomyType = "sport" | "category";

interface TaxonomyDocument {
  _id: ObjectId;
  type: TaxonomyType;
  slug: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductTaxonomyProjection {
  sport?: string;
  category?: string;
}

export interface TaxonomyItem {
  id: string;
  type: TaxonomyType;
  slug: string;
  value: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

const taxonomyTypeSet = new Set<TaxonomyType>(["sport", "category"]);
const TAXONOMY_MONGO_RETRY_COOLDOWN_MS = 30_000;

let taxonomyMongoRetryAfterTs = 0;
let taxonomyMongoIssueLogged = false;
let taxonomyIndexesReady = false;

export class TaxonomyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxonomyValidationError";
  }
}

export class TaxonomyInUseError extends Error {
  readonly usageCount: number;

  constructor(message: string, usageCount: number) {
    super(message);
    this.name = "TaxonomyInUseError";
    this.usageCount = usageCount;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown error";
}

function markTaxonomyMongoUnavailable(error: unknown): void {
  taxonomyMongoRetryAfterTs = Date.now() + TAXONOMY_MONGO_RETRY_COOLDOWN_MS;
  if (!taxonomyMongoIssueLogged) {
    console.warn(
      `[taxonomy-repository] MongoDB unavailable (${getErrorMessage(error)}).`,
    );
    taxonomyMongoIssueLogged = true;
  }
}

function markTaxonomyMongoAvailable(): void {
  taxonomyMongoRetryAfterTs = 0;
  if (taxonomyMongoIssueLogged) {
    console.info("[taxonomy-repository] MongoDB connection restored.");
  }
  taxonomyMongoIssueLogged = false;
}

function normalizeTaxonomyValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureTaxonomyType(type: string): TaxonomyType {
  if (!taxonomyTypeSet.has(type as TaxonomyType)) {
    throw new TaxonomyValidationError("Unsupported taxonomy type.");
  }
  return type as TaxonomyType;
}

function assertValidTaxonomyValue(value: string): void {
  if (value.length < 2 || value.length > 80) {
    throw new TaxonomyValidationError(
      "Value must be between 2 and 80 characters.",
    );
  }
  if (!/[a-zA-Z0-9]/.test(value)) {
    throw new TaxonomyValidationError("Value must include letters or numbers.");
  }
  const slug = createSlug(value);
  if (!slug) {
    throw new TaxonomyValidationError(
      "Value cannot be normalized into a valid key.",
    );
  }
}

async function getTaxonomyCollection(): Promise<Collection<TaxonomyDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }
  if (Date.now() < taxonomyMongoRetryAfterTs) {
    return null;
  }

  try {
    const db = await getMongoDatabase();
    const collection = db.collection<TaxonomyDocument>(
      process.env.MONGODB_TAXONOMY_COLLECTION || "taxonomy",
    );
    if (!taxonomyIndexesReady) {
      await collection.createIndex({ type: 1, slug: 1 }, { unique: true });
      await collection.createIndex({ type: 1, value: 1 });
      await collection.createIndex({ updatedAt: -1 });
      taxonomyIndexesReady = true;
    }
    markTaxonomyMongoAvailable();
    return collection;
  } catch (error) {
    markTaxonomyMongoUnavailable(error);
    return null;
  }
}

async function getProductsCollection(): Promise<Collection<ProductTaxonomyProjection> | null> {
  if (!isMongoConfigured()) {
    return null;
  }
  if (Date.now() < taxonomyMongoRetryAfterTs) {
    return null;
  }

  try {
    const db = await getMongoDatabase();
    markTaxonomyMongoAvailable();
    return db.collection<ProductTaxonomyProjection>(
      process.env.MONGODB_PRODUCTS_COLLECTION || "products",
    );
  } catch (error) {
    markTaxonomyMongoUnavailable(error);
    return null;
  }
}

function toDistinctSorted(values: string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => normalizeTaxonomyValue(value)).filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

async function getDerivedValuesFromProducts(
  type: TaxonomyType,
): Promise<string[]> {
  const productsCollection = await getProductsCollection();
  if (!productsCollection) {
    return [];
  }

  const key = type === "sport" ? "sport" : "category";
  const values = await productsCollection.distinct(key);
  return toDistinctSorted(
    values.filter((value): value is string => typeof value === "string"),
  );
}

async function ensureSeededFromProducts(type: TaxonomyType): Promise<void> {
  const taxonomyCollection = await getTaxonomyCollection();
  if (!taxonomyCollection) {
    return;
  }

  const existingCount = await taxonomyCollection.countDocuments({ type });
  if (existingCount > 0) {
    return;
  }

  const derivedValues = await getDerivedValuesFromProducts(type);
  if (derivedValues.length === 0) {
    return;
  }

  const now = new Date();
  for (const value of derivedValues) {
    const normalizedValue = normalizeTaxonomyValue(value);
    const slug = createSlug(normalizedValue);
    if (!slug) {
      continue;
    }
    await taxonomyCollection.updateOne(
      { type, slug },
      {
        $set: {
          type,
          slug,
          value: normalizedValue,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: new ObjectId(),
          createdAt: now,
        },
      },
      { upsert: true },
    );
  }
}

async function countUsage(type: TaxonomyType, value: string): Promise<number> {
  const productsCollection = await getProductsCollection();
  if (!productsCollection) {
    return 0;
  }

  const field = type === "sport" ? "sport" : "category";
  const regex = new RegExp(`^${escapeRegex(value)}$`, "i");
  return productsCollection.countDocuments({ [field]: regex });
}

async function mapTaxonomyItem(doc: TaxonomyDocument): Promise<TaxonomyItem> {
  const usageCount = await countUsage(doc.type, doc.value);
  return {
    id: doc._id.toHexString(),
    type: doc.type,
    slug: doc.slug,
    value: doc.value,
    usageCount,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function toDerivedTaxonomyItems(
  type: TaxonomyType,
): Promise<TaxonomyItem[]> {
  const derivedValues = await getDerivedValuesFromProducts(type);
  return Promise.all(
    derivedValues.map(async (value, index) => ({
      id: `derived-${type}-${index}`,
      type,
      slug: createSlug(value),
      value,
      usageCount: await countUsage(type, value),
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    })),
  );
}

export function isTaxonomyType(value: string): value is TaxonomyType {
  return taxonomyTypeSet.has(value as TaxonomyType);
}

export async function getTaxonomyItems(
  type: TaxonomyType,
): Promise<TaxonomyItem[]> {
  const safeType = ensureTaxonomyType(type);
  try {
    await ensureSeededFromProducts(safeType);
    const taxonomyCollection = await getTaxonomyCollection();

    if (!taxonomyCollection) {
      return toDerivedTaxonomyItems(safeType);
    }

    const docs = await taxonomyCollection
      .find({ type: safeType })
      .sort({ value: 1 })
      .toArray();
    return Promise.all(docs.map((doc) => mapTaxonomyItem(doc)));
  } catch (error) {
    markTaxonomyMongoUnavailable(error);
    return [];
  }
}

export async function getTaxonomyValues(type: TaxonomyType): Promise<string[]> {
  const items = await getTaxonomyItems(type);
  return items.map((item) => item.value);
}

export async function createTaxonomyItem(params: {
  type: TaxonomyType;
  value: string;
}): Promise<TaxonomyItem> {
  const taxonomyCollection = await getTaxonomyCollection();
  if (!taxonomyCollection) {
    throw new Error("MongoDB is unavailable for taxonomy management.");
  }

  const type = ensureTaxonomyType(params.type);
  const normalizedValue = normalizeTaxonomyValue(params.value);
  assertValidTaxonomyValue(normalizedValue);
  const slug = createSlug(normalizedValue);
  if (!slug) {
    throw new TaxonomyValidationError("Invalid taxonomy key.");
  }

  const now = new Date();
  await taxonomyCollection.updateOne(
    { type, slug },
    {
      $set: {
        type,
        slug,
        value: normalizedValue,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const doc = await taxonomyCollection.findOne({ type, slug });
  if (!doc) {
    throw new Error("Failed to create taxonomy item.");
  }
  return mapTaxonomyItem(doc);
}

export async function renameTaxonomyItem(params: {
  type: TaxonomyType;
  value: string;
  nextValue: string;
}): Promise<{ item: TaxonomyItem; renamedProducts: number }> {
  const taxonomyCollection = await getTaxonomyCollection();
  if (!taxonomyCollection) {
    throw new Error("MongoDB is unavailable for taxonomy management.");
  }

  const productsCollection = await getProductsCollection();
  if (!productsCollection) {
    throw new Error("MongoDB is unavailable for taxonomy management.");
  }

  const type = ensureTaxonomyType(params.type);
  const currentValue = normalizeTaxonomyValue(params.value);
  const nextValue = normalizeTaxonomyValue(params.nextValue);
  assertValidTaxonomyValue(currentValue);
  assertValidTaxonomyValue(nextValue);

  const currentSlug = createSlug(currentValue);
  const nextSlug = createSlug(nextValue);
  if (!currentSlug || !nextSlug) {
    throw new TaxonomyValidationError("Invalid taxonomy key.");
  }

  const current = await taxonomyCollection.findOne({ type, slug: currentSlug });
  if (!current) {
    throw new TaxonomyValidationError("Taxonomy item not found.");
  }

  if (currentSlug === nextSlug) {
    await taxonomyCollection.updateOne(
      { _id: current._id },
      {
        $set: {
          value: nextValue,
          updatedAt: new Date(),
        },
      },
    );
    const updated = await taxonomyCollection.findOne({ _id: current._id });
    if (!updated) {
      throw new Error("Failed to update taxonomy item.");
    }
    return {
      item: await mapTaxonomyItem(updated),
      renamedProducts: 0,
    };
  }

  const conflict = await taxonomyCollection.findOne({ type, slug: nextSlug });
  if (conflict) {
    throw new TaxonomyValidationError("Target value already exists.");
  }

  const now = new Date();
  await taxonomyCollection.updateOne(
    { _id: current._id },
    {
      $set: {
        slug: nextSlug,
        value: nextValue,
        updatedAt: now,
      },
    },
  );

  const field = type === "sport" ? "sport" : "category";
  const renameResult = await productsCollection.updateMany(
    { [field]: new RegExp(`^${escapeRegex(current.value)}$`, "i") },
    {
      $set: {
        [field]: nextValue,
      },
    },
  );

  const updated = await taxonomyCollection.findOne({ _id: current._id });
  if (!updated) {
    throw new Error("Failed to update taxonomy item.");
  }

  return {
    item: await mapTaxonomyItem(updated),
    renamedProducts: renameResult.modifiedCount,
  };
}

export async function deleteTaxonomyItem(params: {
  type: TaxonomyType;
  value: string;
}): Promise<{ deleted: boolean; usageCount: number }> {
  const taxonomyCollection = await getTaxonomyCollection();
  if (!taxonomyCollection) {
    throw new Error("MongoDB is unavailable for taxonomy management.");
  }

  const type = ensureTaxonomyType(params.type);
  const value = normalizeTaxonomyValue(params.value);
  assertValidTaxonomyValue(value);
  const slug = createSlug(value);
  if (!slug) {
    throw new TaxonomyValidationError("Invalid taxonomy key.");
  }

  const existing = await taxonomyCollection.findOne({ type, slug });
  if (!existing) {
    return { deleted: false, usageCount: 0 };
  }

  const usageCount = await countUsage(type, existing.value);
  if (usageCount > 0) {
    throw new TaxonomyInUseError(
      `Cannot delete "${existing.value}" while ${usageCount} product(s) still use it.`,
      usageCount,
    );
  }

  await taxonomyCollection.deleteOne({ _id: existing._id });
  return { deleted: true, usageCount: 0 };
}
