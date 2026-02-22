import { Collection } from "mongodb";

import {
  getDefaultProductColors,
  getDefaultProductSizes,
  isKnownProductImagePath,
  normalizeProductOptionList,
  Product,
  ProductImage,
  ProductTone,
} from "@/lib/catalog";
import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

const legacyProductIdAliases: Record<string, string> = {
  "edge-grip-gloves": "edgegrip-receiver-gloves",
  "aero-shot-elite": "aeroshot-elite-jersey",
};

const PRODUCTS_MONGO_RETRY_COOLDOWN_MS = 30_000;
let productsMongoRetryAfterTs = 0;
let productsMongoIssueLogged = false;
let productsIndexReady = false;

interface ProductDocument {
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
  images?: ProductImage[];
}

export type ProductReadFallbackMode = "empty" | "error";

export interface GetAllProductsOptions {
  fallbackMode?: ProductReadFallbackMode;
}

export type AdminProductSort =
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "rating-desc"
  | "reviews-desc";

export interface AdminProductsQuery {
  q?: string;
  sport?: string;
  category?: string;
  badge?: string;
  sort?: AdminProductSort;
  page?: number;
  pageSize?: number;
}

export interface AdminProductsPage {
  products: Product[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    sports: string[];
    categories: string[];
    badges: string[];
  };
}

export interface AdminProductScopeOptionsPage {
  sports: string[];
  categories: string[];
  productIds: string[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const toneSet = new Set<ProductTone>([
  "field",
  "court",
  "street",
  "fitness",
  "outdoor",
]);
export function resolveProductIdAlias(productId: string): string {
  return legacyProductIdAliases[productId] ?? productId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown error";
}

function markProductsMongoUnavailable(error: unknown): void {
  productsMongoRetryAfterTs = Date.now() + PRODUCTS_MONGO_RETRY_COOLDOWN_MS;
  if (!productsMongoIssueLogged) {
    console.warn(
      `[products-repository] MongoDB unavailable (${getErrorMessage(
        error,
      )}). Running in database-only mode.`,
    );
    productsMongoIssueLogged = true;
  }
}

function markProductsMongoAvailable(): void {
  productsMongoRetryAfterTs = 0;
  if (productsMongoIssueLogged) {
    console.info("[products-repository] MongoDB connection restored.");
  }
  productsMongoIssueLogged = false;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function normalizeBrand(value: unknown): string {
  if (typeof value !== "string") {
    return "Prime Athlete";
  }
  const next = value.trim();
  return next.length >= 2 ? next : "Prime Athlete";
}

function fallbackSkuFromId(id: string): string {
  const safe = id
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe.length >= 2 ? safe : "PA-SKU";
}

function normalizeSku(value: unknown, id: string): string {
  if (typeof value !== "string") {
    return fallbackSkuFromId(id);
  }
  const next = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return next.length >= 2 ? next : fallbackSkuFromId(id);
}

function normalizeStockQuantity(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(Math.floor(value), 0);
}

function normalizeCompareAtPriceCents(
  value: unknown,
  priceCents: number,
): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const next = Math.floor(value);
  if (next <= priceCents) {
    return null;
  }
  return next;
}

function normalizeTags(value: unknown, fallbackValues: string[]): string[] {
  const fromArray = Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];
  const merged = fromArray.length > 0 ? fromArray : fallbackValues;
  return Array.from(
    new Set(merged.map((item) => item.trim()).filter(Boolean)),
  ).slice(0, 12);
}

function isProductTone(value: unknown): value is ProductTone {
  return typeof value === "string" && toneSet.has(value as ProductTone);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFilterValue(value: string | undefined): string {
  return (value || "").trim();
}

function normalizeSearchQuery(value: string | undefined): string {
  return normalizeFilterValue(value).replace(/\s+/g, " ");
}

function normalizeAdminProductSort(
  value: AdminProductSort | undefined,
): AdminProductSort {
  if (
    value === "name-desc" ||
    value === "price-asc" ||
    value === "price-desc" ||
    value === "rating-desc" ||
    value === "reviews-desc"
  ) {
    return value;
  }
  return "name-asc";
}

function createPaginationMeta(params: {
  page: number;
  pageSize: number;
  total: number;
}): {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} {
  const safePageSize = Math.min(Math.max(Math.floor(params.pageSize), 1), 100);
  const safeTotal = Math.max(Math.floor(params.total), 0);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const safePage = Math.min(Math.max(Math.floor(params.page), 1), totalPages);

  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages,
  };
}

function toDistinctSortedStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

function buildProductsFacets(products: Product[]): {
  sports: string[];
  categories: string[];
  badges: string[];
} {
  return {
    sports: toDistinctSortedStrings(products.map((product) => product.sport)),
    categories: toDistinctSortedStrings(
      products.map((product) => product.category),
    ),
    badges: toDistinctSortedStrings(products.map((product) => product.badge)),
  };
}

function getSortValue(
  product: Product,
  sort: AdminProductSort,
): string | number {
  switch (sort) {
    case "name-desc":
    case "name-asc":
      return product.name.toLowerCase();
    case "price-asc":
    case "price-desc":
      return product.priceCents;
    case "rating-desc":
      return product.rating;
    case "reviews-desc":
      return product.reviews;
    default:
      return product.name.toLowerCase();
  }
}

function compareProductsBySort(
  left: Product,
  right: Product,
  sort: AdminProductSort,
): number {
  const leftValue = getSortValue(left, sort);
  const rightValue = getSortValue(right, sort);

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    if (
      sort === "price-desc" ||
      sort === "rating-desc" ||
      sort === "reviews-desc"
    ) {
      if (rightValue !== leftValue) {
        return rightValue - leftValue;
      }
    } else {
      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }
    }
  } else if (typeof leftValue === "string" && typeof rightValue === "string") {
    const compare = leftValue.localeCompare(rightValue);
    if (compare !== 0) {
      return sort === "name-desc" ? -compare : compare;
    }
  }

  return left.id.localeCompare(right.id);
}

function productMatchesAdminQuery(
  product: Product,
  params: {
    query: string;
    sport: string;
    category: string;
    badge: string;
  },
): boolean {
  if (
    params.sport &&
    product.sport.toLowerCase() !== params.sport.toLowerCase()
  ) {
    return false;
  }
  if (
    params.category &&
    product.category.toLowerCase() !== params.category.toLowerCase()
  ) {
    return false;
  }
  if (
    params.badge &&
    product.badge.toLowerCase() !== params.badge.toLowerCase()
  ) {
    return false;
  }

  if (!params.query) {
    return true;
  }

  const searchableText =
    `${product.id} ${product.name} ${product.sport} ${product.category} ${product.badge} ${product.description} ${product.brand || ""} ${product.sku || ""} ${(product.tags || []).join(" ")} ${(product.sizes || []).join(" ")} ${(product.colors || []).join(" ")}`.toLowerCase();
  return searchableText.includes(params.query.toLowerCase());
}

function parseProductImages(
  value: unknown,
  productName: string,
): ProductImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const images = value
    .map((item): ProductImage | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Partial<ProductImage>;
      if (typeof candidate.src !== "string") {
        return null;
      }

      if (!isKnownProductImagePath(candidate.src)) {
        return null;
      }

      return {
        src: candidate.src,
        alt:
          typeof candidate.alt === "string" && candidate.alt.trim().length > 0
            ? candidate.alt
            : `${productName} image`,
        width:
          typeof candidate.width === "number" && candidate.width > 0
            ? Math.floor(candidate.width)
            : undefined,
        height:
          typeof candidate.height === "number" && candidate.height > 0
            ? Math.floor(candidate.height)
            : undefined,
      };
    })
    .filter((item): item is ProductImage => item !== null);

  return images;
}

function toProductReadFallbackMode(
  value: ProductReadFallbackMode | undefined,
): ProductReadFallbackMode {
  return value === "error" ? "error" : "empty";
}

function shouldFailWhenMongoUnavailable(
  fallbackMode: ProductReadFallbackMode,
): boolean {
  return fallbackMode === "error" && isMongoConfigured();
}

function createLiveProductsUnavailableError(cause?: unknown): Error {
  const reason =
    cause instanceof Error && cause.message.trim().length > 0
      ? cause.message.trim()
      : "unknown error";

  return new Error(
    `Live MongoDB product data is required but unavailable (${reason}). Check MONGODB_URI, MONGODB_DB, cluster network access, and timeout env settings.`,
  );
}

function sortProductsStable(products: Product[]): Product[] {
  return [...products].sort((left, right) => left.id.localeCompare(right.id));
}

function toProduct(
  doc: Partial<ProductDocument> | null | undefined,
): Product | null {
  if (!doc) {
    return null;
  }

  if (
    typeof doc.id !== "string" ||
    typeof doc.name !== "string" ||
    typeof doc.sport !== "string" ||
    typeof doc.category !== "string" ||
    typeof doc.badge !== "string" ||
    typeof doc.description !== "string" ||
    !isProductTone(doc.tone)
  ) {
    return null;
  }

  const priceCents = asNumber(doc.priceCents);
  const rating = asNumber(doc.rating);
  const reviews = asNumber(doc.reviews);

  if (priceCents === null || rating === null || reviews === null) {
    return null;
  }

  const images = parseProductImages(doc.images, doc.name);
  if (images.length === 0) {
    return null;
  }

  const sizes = normalizeProductOptionList(
    doc.sizes,
    getDefaultProductSizes(doc.category),
  );
  const colors = normalizeProductOptionList(
    doc.colors,
    getDefaultProductColors(doc.sport, doc.category),
  );

  return {
    id: doc.id,
    name: doc.name,
    sport: doc.sport,
    category: doc.category,
    priceCents,
    brand: normalizeBrand(doc.brand),
    sku: normalizeSku(doc.sku, doc.id),
    stockQuantity: normalizeStockQuantity(doc.stockQuantity),
    compareAtPriceCents: normalizeCompareAtPriceCents(
      doc.compareAtPriceCents,
      priceCents,
    ),
    tags: normalizeTags(doc.tags, [doc.sport, doc.category, doc.badge]),
    sizes,
    colors,
    rating,
    reviews,
    badge: doc.badge,
    description: doc.description,
    tone: doc.tone,
    images,
  };
}

async function getProductsCollection(options?: {
  ignoreCooldown?: boolean;
}): Promise<Collection<ProductDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }
  if (!options?.ignoreCooldown && Date.now() < productsMongoRetryAfterTs) {
    return null;
  }

  try {
    const db = await getMongoDatabase();
    const collection = db.collection<ProductDocument>(
      process.env.MONGODB_PRODUCTS_COLLECTION || "products",
    );
    if (!productsIndexReady) {
      await collection.createIndex({ id: 1 }, { unique: true });
      productsIndexReady = true;
    }
    markProductsMongoAvailable();
    return collection;
  } catch (error) {
    markProductsMongoUnavailable(error);
    return null;
  }
}

export async function getAllProducts(
  options?: GetAllProductsOptions,
): Promise<Product[]> {
  const fallbackMode = toProductReadFallbackMode(options?.fallbackMode);
  const failWhenMongoUnavailable = shouldFailWhenMongoUnavailable(fallbackMode);

  try {
    const collection = await getProductsCollection({
      ignoreCooldown: failWhenMongoUnavailable,
    });
    if (!collection) {
      if (failWhenMongoUnavailable) {
        throw createLiveProductsUnavailableError(
          new Error("Mongo collection handle was not available."),
        );
      }
      return [];
    }

    const docs = await collection.find({}).toArray();
    const products = docs
      .map((doc) => toProduct(doc))
      .filter((product): product is Product => product !== null);

    if (products.length === 0) {
      return [];
    }

    return sortProductsStable(products);
  } catch (error) {
    markProductsMongoUnavailable(error);
    if (failWhenMongoUnavailable) {
      throw createLiveProductsUnavailableError(error);
    }
    return [];
  }
}

function buildMongoProductFilter(params: {
  query: string;
  sport: string;
  category: string;
  badge: string;
}): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (params.query) {
    const queryRegex = new RegExp(escapeRegex(params.query), "i");
    conditions.push({
      $or: [
        { id: queryRegex },
        { name: queryRegex },
        { sport: queryRegex },
        { category: queryRegex },
        { badge: queryRegex },
        { description: queryRegex },
        { brand: queryRegex },
        { sku: queryRegex },
        { tags: queryRegex },
      ],
    });
  }

  if (params.sport) {
    conditions.push({
      sport: new RegExp(`^${escapeRegex(params.sport)}$`, "i"),
    });
  }
  if (params.category) {
    conditions.push({
      category: new RegExp(`^${escapeRegex(params.category)}$`, "i"),
    });
  }
  if (params.badge) {
    conditions.push({
      badge: new RegExp(`^${escapeRegex(params.badge)}$`, "i"),
    });
  }

  if (conditions.length === 0) {
    return {};
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return {
    $and: conditions,
  };
}

function buildMongoSort(sort: AdminProductSort): Record<string, 1 | -1> {
  switch (sort) {
    case "name-desc":
      return { name: -1, id: 1 };
    case "price-asc":
      return { priceCents: 1, name: 1, id: 1 };
    case "price-desc":
      return { priceCents: -1, name: 1, id: 1 };
    case "rating-desc":
      return { rating: -1, reviews: -1, name: 1, id: 1 };
    case "reviews-desc":
      return { reviews: -1, rating: -1, name: 1, id: 1 };
    default:
      return { name: 1, id: 1 };
  }
}

function buildInMemoryAdminProductsPage(params: {
  sourceProducts: Product[];
  query: string;
  sport: string;
  category: string;
  badge: string;
  sort: AdminProductSort;
  page: number;
  pageSize: number;
}): AdminProductsPage {
  const facets = buildProductsFacets(params.sourceProducts);
  const filtered = params.sourceProducts
    .filter((product) =>
      productMatchesAdminQuery(product, {
        query: params.query,
        sport: params.sport,
        category: params.category,
        badge: params.badge,
      }),
    )
    .sort((left, right) => compareProductsBySort(left, right, params.sort));

  const pagination = createPaginationMeta({
    page: params.page,
    pageSize: params.pageSize,
    total: filtered.length,
  });
  const start = (pagination.page - 1) * pagination.pageSize;
  const products = filtered.slice(start, start + pagination.pageSize);

  return {
    products,
    pagination,
    filters: facets,
  };
}

export async function getAdminProductsPage(
  query: AdminProductsQuery,
): Promise<AdminProductsPage> {
  const normalizedQuery = normalizeSearchQuery(query.q);
  const normalizedSport = normalizeFilterValue(query.sport);
  const normalizedCategory = normalizeFilterValue(query.category);
  const normalizedBadge = normalizeFilterValue(query.badge);
  const normalizedSort = normalizeAdminProductSort(query.sort);
  const requestedPage = Number(query.page || 1);
  const requestedPageSize = Number(query.pageSize || 24);

  try {
    const collection = await getProductsCollection();
    if (collection) {
      const mongoFilter = buildMongoProductFilter({
        query: normalizedQuery,
        sport: normalizedSport,
        category: normalizedCategory,
        badge: normalizedBadge,
      });
      const total = await collection.countDocuments(mongoFilter);

      const pagination = createPaginationMeta({
        page: requestedPage,
        pageSize: requestedPageSize,
        total,
      });
      const skip = (pagination.page - 1) * pagination.pageSize;

      const docs =
        total > 0
          ? await collection
              .find(mongoFilter)
              .sort(buildMongoSort(normalizedSort))
              .skip(skip)
              .limit(pagination.pageSize)
              .toArray()
          : [];

      const products = docs
        .map((doc) => toProduct(doc))
        .filter((product): product is Product => product !== null);

      const [sportsRaw, categoriesRaw, badgesRaw] = await Promise.all([
        collection.distinct("sport"),
        collection.distinct("category"),
        collection.distinct("badge"),
      ]);

      return {
        products,
        pagination,
        filters: {
          sports: toDistinctSortedStrings(
            sportsRaw.filter(
              (value): value is string => typeof value === "string",
            ),
          ),
          categories: toDistinctSortedStrings(
            categoriesRaw.filter(
              (value): value is string => typeof value === "string",
            ),
          ),
          badges: toDistinctSortedStrings(
            badgesRaw.filter(
              (value): value is string => typeof value === "string",
            ),
          ),
        },
      };
    }
  } catch (error) {
    markProductsMongoUnavailable(error);
  }

  return buildInMemoryAdminProductsPage({
    sourceProducts: [],
    query: normalizedQuery,
    sport: normalizedSport,
    category: normalizedCategory,
    badge: normalizedBadge,
    sort: normalizedSort,
    page: requestedPage,
    pageSize: requestedPageSize,
  });
}

export async function getAdminProductScopeOptionsPage(params: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminProductScopeOptionsPage> {
  const normalizedQuery = normalizeSearchQuery(params.q);
  const requestedPage = Number(params.page || 1);
  const requestedPageSize = Number(params.pageSize || 100);

  try {
    const collection = await getProductsCollection();
    if (collection) {
      const idFilter = normalizedQuery
        ? {
            $or: [
              { id: new RegExp(escapeRegex(normalizedQuery), "i") },
              { name: new RegExp(escapeRegex(normalizedQuery), "i") },
            ],
          }
        : {};

      const total = await collection.countDocuments(idFilter);
      const pagination = createPaginationMeta({
        page: requestedPage,
        pageSize: requestedPageSize,
        total,
      });
      const skip = (pagination.page - 1) * pagination.pageSize;

      const docs =
        total > 0
          ? await collection
              .find(idFilter, { projection: { _id: 0, id: 1 } })
              .sort({ id: 1 })
              .skip(skip)
              .limit(pagination.pageSize)
              .toArray()
          : [];

      const [sportsRaw, categoriesRaw] = await Promise.all([
        collection.distinct("sport"),
        collection.distinct("category"),
      ]);

      return {
        sports: toDistinctSortedStrings(
          sportsRaw.filter(
            (value): value is string => typeof value === "string",
          ),
        ),
        categories: toDistinctSortedStrings(
          categoriesRaw.filter(
            (value): value is string => typeof value === "string",
          ),
        ),
        productIds: toDistinctSortedStrings(
          docs
            .map((doc) => (typeof doc.id === "string" ? doc.id : ""))
            .filter((value) => value.length > 0),
        ),
        pagination,
      };
    }
  } catch (error) {
    markProductsMongoUnavailable(error);
  }

  const sourceProducts: Product[] = [];
  const sortedIds = toDistinctSortedStrings(
    sourceProducts
      .filter((product) => {
        if (!normalizedQuery) {
          return true;
        }
        const query = normalizedQuery.toLowerCase();
        return (
          product.id.toLowerCase().includes(query) ||
          product.name.toLowerCase().includes(query)
        );
      })
      .map((product) => product.id),
  );

  const pagination = createPaginationMeta({
    page: requestedPage,
    pageSize: requestedPageSize,
    total: sortedIds.length,
  });
  const start = (pagination.page - 1) * pagination.pageSize;

  return {
    sports: toDistinctSortedStrings(
      sourceProducts.map((product) => product.sport),
    ),
    categories: toDistinctSortedStrings(
      sourceProducts.map((product) => product.category),
    ),
    productIds: sortedIds.slice(start, start + pagination.pageSize),
    pagination,
  };
}

export async function getProductById(
  productId: string,
): Promise<Product | null> {
  const normalizedId = resolveProductIdAlias(productId);

  try {
    const collection = await getProductsCollection();

    if (collection) {
      const doc = await collection.findOne({ id: normalizedId });
      const mongoProduct = toProduct(doc ?? undefined);
      if (mongoProduct) {
        return mongoProduct;
      }
    }
  } catch (error) {
    markProductsMongoUnavailable(error);
  }

  return null;
}

export async function getProductsByIds(
  productIds: string[],
): Promise<Product[]> {
  const normalizedIds = Array.from(
    new Set(productIds.map((id) => resolveProductIdAlias(id))),
  );

  if (normalizedIds.length === 0) {
    return [];
  }

  try {
    const collection = await getProductsCollection();

    if (collection) {
      const docs = await collection
        .find({ id: { $in: normalizedIds } })
        .toArray();
      const parsed = docs
        .map((doc) => toProduct(doc))
        .filter((product): product is Product => product !== null);

      if (parsed.length > 0) {
        const byId = new Map(parsed.map((item) => [item.id, item]));
        return normalizedIds
          .map((id) => byId.get(id))
          .filter((item): item is Product => Boolean(item));
      }
    }
  } catch (error) {
    markProductsMongoUnavailable(error);
  }

  return [];
}

export async function upsertProduct(product: Product): Promise<void> {
  const collection = await getProductsCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for product management.");
  }

  await collection.updateOne(
    { id: product.id },
    {
      $set: {
        id: product.id,
        name: product.name,
        sport: product.sport,
        category: product.category,
        priceCents: product.priceCents,
        brand: normalizeBrand(product.brand),
        sku: normalizeSku(product.sku, product.id),
        stockQuantity: normalizeStockQuantity(product.stockQuantity),
        compareAtPriceCents: normalizeCompareAtPriceCents(
          product.compareAtPriceCents,
          product.priceCents,
        ),
        tags: normalizeTags(product.tags, [
          product.sport,
          product.category,
          product.badge,
        ]),
        sizes: normalizeProductOptionList(
          product.sizes,
          getDefaultProductSizes(product.category),
        ),
        colors: normalizeProductOptionList(
          product.colors,
          getDefaultProductColors(product.sport, product.category),
        ),
        rating: product.rating,
        reviews: product.reviews,
        badge: product.badge,
        description: product.description,
        tone: product.tone,
        images: product.images,
      },
    },
    { upsert: true },
  );
}

export async function deleteProductById(productId: string): Promise<void> {
  const collection = await getProductsCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for product management.");
  }

  await collection.deleteOne({ id: resolveProductIdAlias(productId) });
}
