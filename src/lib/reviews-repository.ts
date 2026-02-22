import "server-only";

import { Collection, ObjectId } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

export type ReviewModerationStatus = "approved" | "hidden";

interface ProductReviewDocument {
  _id: ObjectId;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  productId: string;
  productName: string;
  sport: string;
  rating: number;
  title: string;
  comment: string;
  status?: ReviewModerationStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductAggregateDocument {
  id: string;
  rating?: number;
  reviews?: number;
}

interface ReviewContribution {
  count: number;
  weight: number;
}

interface AdminReviewsMongoFilter {
  $and?: Array<Record<string, unknown>>;
}

export interface ProductReview {
  id: string;
  userDisplayName: string;
  productId: string;
  productName: string;
  sport: string;
  rating: number;
  title: string;
  comment: string;
  status: ReviewModerationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductReview extends ProductReview {
  userId: string;
  userEmail: string;
}

export interface AdminProductReviewsPage {
  reviews: AdminProductReview[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    statuses: ReviewModerationStatus[];
    productIds: string[];
  };
}

export interface UpsertProductReviewInput {
  userId: string;
  userEmail: string;
  userDisplayName: string;
  productId: string;
  productName: string;
  sport: string;
  rating: number;
  title: string;
  comment: string;
}

export type AdminReviewModerationAction = "approve" | "hide" | "delete";

export interface AdminModerateProductReviewResult {
  action: AdminReviewModerationAction;
  deleted: boolean;
  review: AdminProductReview | null;
  changed: boolean;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeStatus(value: unknown): ReviewModerationStatus {
  return value === "hidden" ? "hidden" : "approved";
}

function clampRating(value: number): number {
  const rounded = Math.round(value);
  if (rounded < 1) {
    return 1;
  }
  if (rounded > 5) {
    return 5;
  }
  return rounded;
}

function roundRating(value: number): number {
  return Number(value.toFixed(2));
}

function toSafeReviewCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(Math.floor(value), 0);
}

function toSafeRating(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 5);
}

function parseObjectId(value: string): ObjectId | null {
  if (!ObjectId.isValid(value)) {
    return null;
  }
  return new ObjectId(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapProductReview(doc: ProductReviewDocument): ProductReview {
  return {
    id: doc._id.toHexString(),
    userDisplayName: doc.userDisplayName,
    productId: doc.productId,
    productName: doc.productName,
    sport: doc.sport,
    rating: doc.rating,
    title: doc.title,
    comment: doc.comment,
    status: normalizeStatus(doc.status),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function mapAdminProductReview(doc: ProductReviewDocument): AdminProductReview {
  return {
    ...mapProductReview(doc),
    userId: doc.userId,
    userEmail: doc.userEmail,
  };
}

function toDistinctSortedStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
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

function reviewContribution(params: {
  status: ReviewModerationStatus;
  rating: number;
}): ReviewContribution {
  if (params.status !== "approved") {
    return { count: 0, weight: 0 };
  }
  const rating = clampRating(params.rating);
  return {
    count: 1,
    weight: rating,
  };
}

async function getProductsCollectionForAggregates(): Promise<Collection<ProductAggregateDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  return db.collection<ProductAggregateDocument>(
    process.env.MONGODB_PRODUCTS_COLLECTION || "products",
  );
}

async function applyReviewAggregateTransition(params: {
  productId: string;
  previous: ReviewContribution;
  next: ReviewContribution;
}): Promise<void> {
  const productCollection = await getProductsCollectionForAggregates();
  if (!productCollection) {
    return;
  }

  const productDoc = await productCollection.findOne(
    { id: params.productId },
    { projection: { _id: 0, id: 1, rating: 1, reviews: 1 } },
  );
  if (!productDoc) {
    return;
  }

  const currentReviews = toSafeReviewCount(productDoc.reviews);
  const currentRating = toSafeRating(productDoc.rating);
  const currentWeightedTotal = currentRating * currentReviews;

  const nextReviewsRaw =
    currentReviews - params.previous.count + params.next.count;
  const nextReviews = Math.max(0, nextReviewsRaw);
  const nextWeightedRaw =
    currentWeightedTotal - params.previous.weight + params.next.weight;
  const maxWeighted = nextReviews * 5;
  const nextWeightedTotal = Math.min(Math.max(nextWeightedRaw, 0), maxWeighted);
  const nextRating =
    nextReviews > 0 ? roundRating(nextWeightedTotal / nextReviews) : 0;

  await productCollection.updateOne(
    { id: params.productId },
    {
      $set: {
        rating: nextRating,
        reviews: nextReviews,
      },
    },
  );
}

async function getReviewsCollection(): Promise<Collection<ProductReviewDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<ProductReviewDocument>(
    process.env.MONGODB_REVIEWS_COLLECTION || "reviews",
  );

  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ updatedAt: -1 });
  await collection.createIndex({ productId: 1, createdAt: -1 });
  await collection.createIndex({ productId: 1, status: 1, createdAt: -1 });
  await collection.createIndex({ userId: 1, productId: 1 }, { unique: true });

  return collection;
}

function buildPublicReviewFilter(
  params: { productId?: string } = {},
): Record<string, unknown> {
  const andFilters: Record<string, unknown>[] = [
    {
      $or: [{ status: "approved" }, { status: { $exists: false } }],
    },
  ];

  if (params.productId) {
    andFilters.push({ productId: params.productId });
  }

  if (andFilters.length === 1) {
    return andFilters[0];
  }

  return { $and: andFilters };
}

function parseAdminStatusFilter(
  value: string | undefined,
): ReviewModerationStatus | null {
  if (value === "approved" || value === "hidden") {
    return value;
  }
  return null;
}

function buildAdminReviewsFilter(params: {
  q: string;
  status: ReviewModerationStatus | null;
  productId: string;
}): AdminReviewsMongoFilter | Record<string, never> {
  const andFilters: Array<Record<string, unknown>> = [];

  if (params.status === "approved") {
    andFilters.push({
      $or: [{ status: "approved" }, { status: { $exists: false } }],
    });
  } else if (params.status === "hidden") {
    andFilters.push({
      status: "hidden",
    });
  }

  if (params.productId) {
    andFilters.push({
      productId: params.productId,
    });
  }

  if (params.q) {
    const queryRegex = new RegExp(escapeRegex(params.q), "i");
    andFilters.push({
      $or: [
        { userDisplayName: queryRegex },
        { userEmail: queryRegex },
        { productName: queryRegex },
        { productId: queryRegex },
        { title: queryRegex },
        { comment: queryRegex },
      ],
    });
  }

  if (andFilters.length === 0) {
    return {};
  }

  if (andFilters.length === 1) {
    return andFilters[0] || {};
  }

  return { $and: andFilters };
}

export async function getRecentProductReviews(params?: {
  limit?: number;
  productId?: string;
  includeHidden?: boolean;
}): Promise<ProductReview[]> {
  const collection = await getReviewsCollection();
  if (!collection) {
    return [];
  }

  const requestedLimit = Number(params?.limit ?? 12);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 500)
    : 12;
  const productId =
    typeof params?.productId === "string"
      ? normalizeText(params.productId)
      : "";
  const filter = params?.includeHidden
    ? productId
      ? { productId }
      : {}
    : buildPublicReviewFilter({ productId: productId || undefined });

  const docs = await collection
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => mapProductReview(doc));
}

export async function getProductReviewsByProductId(params: {
  productId: string;
  includeHidden?: boolean;
}): Promise<ProductReview[]> {
  const collection = await getReviewsCollection();
  if (!collection) {
    return [];
  }

  const productId = normalizeText(params.productId);
  if (productId.length === 0) {
    return [];
  }

  const filter = params.includeHidden
    ? { productId }
    : buildPublicReviewFilter({ productId });

  const docs = await collection
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .toArray();

  return docs.map((doc) => mapProductReview(doc));
}

export async function getAdminProductReviewsPage(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  productId?: string;
}): Promise<AdminProductReviewsPage> {
  const collection = await getReviewsCollection();
  if (!collection) {
    return {
      reviews: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
      },
      filters: {
        statuses: ["approved", "hidden"],
        productIds: [],
      },
    };
  }

  const query = normalizeText(params?.q || "");
  const status = parseAdminStatusFilter(params?.status);
  const productId = normalizeText(params?.productId || "");
  const filter = buildAdminReviewsFilter({
    q: query,
    status,
    productId,
  });
  const requestedPage = Number(params?.page || 1);
  const requestedPageSize = Number(params?.pageSize || 20);
  const total = await collection.countDocuments(filter);
  const pagination = createPaginationMeta({
    page: requestedPage,
    pageSize: requestedPageSize,
    total,
  });

  const docs =
    total > 0
      ? await collection
          .find(filter)
          .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
          .skip((pagination.page - 1) * pagination.pageSize)
          .limit(pagination.pageSize)
          .toArray()
      : [];

  const productIdsRaw = await collection.distinct("productId");

  return {
    reviews: docs.map((doc) => mapAdminProductReview(doc)),
    pagination,
    filters: {
      statuses: ["approved", "hidden"],
      productIds: toDistinctSortedStrings(
        productIdsRaw.filter(
          (value): value is string => typeof value === "string",
        ),
      ),
    },
  };
}

export async function upsertProductReview(
  input: UpsertProductReviewInput,
): Promise<ProductReview> {
  const collection = await getReviewsCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for reviews.");
  }

  const userId = normalizeText(input.userId);
  const userEmail = normalizeText(input.userEmail).toLowerCase();
  const userDisplayName = normalizeText(input.userDisplayName);
  const productId = normalizeText(input.productId);
  const productName = normalizeText(input.productName);
  const sport = normalizeText(input.sport);
  const rating = clampRating(input.rating);
  const title = normalizeText(input.title);
  const comment = normalizeText(input.comment);

  const existingReview = await collection.findOne(
    { userId, productId },
    { projection: { _id: 0, rating: 1, status: 1 } },
  );
  const previousStatus = normalizeStatus(existingReview?.status);
  const previousContribution = existingReview
    ? reviewContribution({
        status: previousStatus,
        rating: clampRating(existingReview.rating),
      })
    : { count: 0, weight: 0 };
  const nextStatus = existingReview ? previousStatus : "approved";
  const nextContribution = reviewContribution({
    status: nextStatus,
    rating,
  });

  const now = new Date();
  await collection.updateOne(
    { userId, productId },
    {
      $set: {
        userEmail,
        userDisplayName,
        productName,
        sport,
        rating,
        title,
        comment,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        userId,
        productId,
        status: "approved",
        createdAt: now,
      },
    },
    { upsert: true },
  );

  if (
    previousContribution.count !== nextContribution.count ||
    previousContribution.weight !== nextContribution.weight
  ) {
    await applyReviewAggregateTransition({
      productId,
      previous: previousContribution,
      next: nextContribution,
    });
  }

  const saved = await collection.findOne({ userId, productId });
  if (!saved) {
    throw new Error("Unable to persist review.");
  }

  return mapProductReview(saved);
}

export async function moderateProductReview(params: {
  reviewId: string;
  action: AdminReviewModerationAction;
}): Promise<AdminModerateProductReviewResult> {
  const collection = await getReviewsCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for reviews.");
  }

  const reviewObjectId = parseObjectId(params.reviewId);
  if (!reviewObjectId) {
    throw new Error("Invalid review id.");
  }

  const existing = await collection.findOne({ _id: reviewObjectId });
  if (!existing) {
    throw new Error("Review not found.");
  }

  const previousStatus = normalizeStatus(existing.status);
  const previousContribution = reviewContribution({
    status: previousStatus,
    rating: clampRating(existing.rating),
  });

  if (params.action === "delete") {
    await collection.deleteOne({ _id: reviewObjectId });
    if (previousContribution.count > 0) {
      await applyReviewAggregateTransition({
        productId: existing.productId,
        previous: previousContribution,
        next: { count: 0, weight: 0 },
      });
    }
    return {
      action: params.action,
      deleted: true,
      review: null,
      changed: true,
    };
  }

  const nextStatus: ReviewModerationStatus =
    params.action === "approve" ? "approved" : "hidden";
  if (nextStatus === previousStatus) {
    return {
      action: params.action,
      deleted: false,
      review: mapAdminProductReview(existing),
      changed: false,
    };
  }

  const now = new Date();
  await collection.updateOne(
    { _id: reviewObjectId },
    {
      $set: {
        status: nextStatus,
        updatedAt: now,
      },
    },
  );

  const updated = await collection.findOne({ _id: reviewObjectId });
  if (!updated) {
    throw new Error("Unable to load moderated review.");
  }

  const nextContribution = reviewContribution({
    status: nextStatus,
    rating: clampRating(updated.rating),
  });

  await applyReviewAggregateTransition({
    productId: updated.productId,
    previous: previousContribution,
    next: nextContribution,
  });

  return {
    action: params.action,
    deleted: false,
    review: mapAdminProductReview(updated),
    changed: true,
  };
}
