import { Collection } from "mongodb";

import { formatPrice } from "@/lib/catalog";
import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

export type PromotionDiscountType = "percent" | "fixed";
export type PromotionTriggerType = "code" | "automatic";
export type PromotionStackMode = "stackable" | "exclusive";

export interface PromotionScope {
  sports: string[];
  categories: string[];
  productIds: string[];
}

export interface Promotion {
  id: string;
  code: string;
  name: string;
  description: string;
  triggerType: PromotionTriggerType;
  stackMode: PromotionStackMode;
  priority: number;
  scope: PromotionScope;
  discountType: PromotionDiscountType;
  discountValue: number;
  minSubtotalCents: number;
  maxDiscountCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  usageLimit: number | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PromotionDocument {
  id: string;
  code: string;
  name: string;
  description: string;
  triggerType?: PromotionTriggerType;
  stackMode?: PromotionStackMode;
  priority?: number;
  scope?: PromotionScope;
  discountType: PromotionDiscountType;
  discountValue: number;
  minSubtotalCents: number;
  maxDiscountCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  usageLimit: number | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromotionUpsertInput {
  id?: string;
  code: string;
  name: string;
  description?: string;
  triggerType?: PromotionTriggerType;
  stackMode?: PromotionStackMode;
  priority?: number;
  scope?: Partial<PromotionScope>;
  discountType: PromotionDiscountType;
  discountValue: number;
  minSubtotalCents?: number;
  maxDiscountCents?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
  usageLimit?: number | null;
}

export interface PromotionCartItem {
  id: string;
  sport: string;
  category: string;
  quantity: number;
  unitAmountCents: number;
}

export interface AppliedPromotionResult {
  id: string;
  code: string;
  name: string;
  triggerType: PromotionTriggerType;
  stackMode: PromotionStackMode;
  priority: number;
  discountType: PromotionDiscountType;
  discountValue: number;
  discountCents: number;
  eligibleSubtotalCents: number;
}

export interface PromotionResolution {
  valid: boolean;
  reason: string | null;
  subtotalCents: number;
  totalDiscountCents: number;
  finalSubtotalCents: number;
  appliedPromotions: AppliedPromotionResult[];
}

export type AdminPromotionStatusFilter =
  | "all"
  | "active"
  | "scheduled"
  | "expired"
  | "inactive";

export interface AdminPromotionsQuery {
  q?: string;
  status?: AdminPromotionStatusFilter;
  triggerType?: PromotionTriggerType | "all";
  stackMode?: PromotionStackMode | "all";
  page?: number;
  pageSize?: number;
}

export interface AdminPromotionsPage {
  promotions: Promotion[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  stats: {
    active: number;
    scheduled: number;
    expired: number;
    inactive: number;
  };
}

const discountTypeSet = new Set<PromotionDiscountType>(["percent", "fixed"]);
const triggerTypeSet = new Set<PromotionTriggerType>(["code", "automatic"]);
const stackModeSet = new Set<PromotionStackMode>(["stackable", "exclusive"]);

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchQuery(value: string | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

function normalizeAdminStatus(
  value: AdminPromotionStatusFilter | undefined,
): AdminPromotionStatusFilter {
  if (
    value === "active" ||
    value === "scheduled" ||
    value === "expired" ||
    value === "inactive"
  ) {
    return value;
  }
  return "all";
}

function normalizeTriggerFilter(
  value: PromotionTriggerType | "all" | undefined,
): PromotionTriggerType | "all" {
  if (value === "code" || value === "automatic") {
    return value;
  }
  return "all";
}

function normalizeStackFilter(
  value: PromotionStackMode | "all" | undefined,
): PromotionStackMode | "all" {
  if (value === "stackable" || value === "exclusive") {
    return value;
  }
  return "all";
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

function normalizeCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTextScopeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeScopeList(
  values: unknown,
  valueType: "text" | "product",
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalizedValues = values
    .map((value) => {
      if (typeof value !== "string") {
        return null;
      }
      const normalized =
        valueType === "product"
          ? normalizeId(value)
          : normalizeTextScopeValue(value);
      return normalized.length > 0 ? normalized : null;
    })
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(normalizedValues)).slice(0, 100);
}

function normalizeScope(
  scope?: Partial<PromotionScope> | null,
): PromotionScope {
  return {
    sports: normalizeScopeList(scope?.sports, "text"),
    categories: normalizeScopeList(scope?.categories, "text"),
    productIds: normalizeScopeList(scope?.productIds, "product"),
  };
}

function buildPromotionId(code: string): string {
  const normalized = normalizeId(code);
  if (!normalized) {
    return `promo-${Date.now()}`;
  }
  return normalized.startsWith("promo-") ? normalized : `promo-${normalized}`;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function asDateOrNull(value: unknown): Date | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function toPromotion(
  doc: Partial<PromotionDocument> | null | undefined,
): Promotion | null {
  if (!doc) {
    return null;
  }

  if (
    typeof doc.id !== "string" ||
    typeof doc.code !== "string" ||
    typeof doc.name !== "string" ||
    typeof doc.description !== "string" ||
    typeof doc.discountType !== "string" ||
    !discountTypeSet.has(doc.discountType as PromotionDiscountType)
  ) {
    return null;
  }

  const discountValue = asNumber(doc.discountValue);
  const minSubtotalCents = asNumber(doc.minSubtotalCents);
  const usageCount = asNumber(doc.usageCount);
  const priorityRaw = asNumber(doc.priority);
  const maxDiscountCentsRaw =
    typeof doc.maxDiscountCents === "number" ? doc.maxDiscountCents : null;
  const usageLimitRaw =
    typeof doc.usageLimit === "number" ? doc.usageLimit : null;
  const createdAt = asDateOrNull(doc.createdAt);
  const updatedAt = asDateOrNull(doc.updatedAt);

  if (
    discountValue === null ||
    minSubtotalCents === null ||
    usageCount === null ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const triggerType = triggerTypeSet.has(
    doc.triggerType as PromotionTriggerType,
  )
    ? (doc.triggerType as PromotionTriggerType)
    : "code";
  const stackMode = stackModeSet.has(doc.stackMode as PromotionStackMode)
    ? (doc.stackMode as PromotionStackMode)
    : "exclusive";

  const legacyScopeCandidate =
    doc.scope && typeof doc.scope === "object"
      ? doc.scope
      : ({
          sports: (doc as unknown as { sports?: unknown }).sports,
          categories: (doc as unknown as { categories?: unknown }).categories,
          productIds: (doc as unknown as { productIds?: unknown }).productIds,
        } as Partial<PromotionScope>);

  return {
    id: doc.id,
    code: normalizeCode(doc.code),
    name: doc.name,
    description: doc.description,
    triggerType,
    stackMode,
    priority: priorityRaw !== null ? clampInteger(priorityRaw, 0, 1000) : 100,
    scope: normalizeScope(legacyScopeCandidate),
    discountType: doc.discountType as PromotionDiscountType,
    discountValue: Math.floor(discountValue),
    minSubtotalCents: Math.max(Math.floor(minSubtotalCents), 0),
    maxDiscountCents:
      maxDiscountCentsRaw && maxDiscountCentsRaw > 0
        ? Math.floor(maxDiscountCentsRaw)
        : null,
    startsAt: asDateOrNull(doc.startsAt),
    endsAt: asDateOrNull(doc.endsAt),
    isActive: Boolean(doc.isActive),
    usageLimit:
      usageLimitRaw && usageLimitRaw > 0 ? Math.floor(usageLimitRaw) : null,
    usageCount: Math.max(Math.floor(usageCount), 0),
    createdAt,
    updatedAt,
  };
}

function normalizeCartItem(item: PromotionCartItem): PromotionCartItem | null {
  const id = normalizeId(item.id);
  const sport = normalizeTextScopeValue(item.sport);
  const category = normalizeTextScopeValue(item.category);
  const quantity = clampInteger(item.quantity, 1, 99);
  const unitAmountCents = clampInteger(item.unitAmountCents, 0, 20_000_000);

  if (!id || !sport || !category || unitAmountCents <= 0 || quantity <= 0) {
    return null;
  }

  return {
    id,
    sport,
    category,
    quantity,
    unitAmountCents,
  };
}

function getItemSubtotalCents(item: PromotionCartItem): number {
  return Math.max(item.unitAmountCents * item.quantity, 0);
}

function matchesPromotionScope(
  item: PromotionCartItem,
  promotion: Promotion,
): boolean {
  const { sports, categories, productIds } = promotion.scope;
  if (
    sports.length === 0 &&
    categories.length === 0 &&
    productIds.length === 0
  ) {
    return true;
  }

  return (
    productIds.includes(item.id) ||
    sports.includes(item.sport) ||
    categories.includes(item.category)
  );
}

function getPromotionInactiveReason(
  promotion: Promotion,
  now: Date,
): string | null {
  if (!promotion.isActive) {
    return "Coupon is currently inactive.";
  }

  if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) {
    return "Coupon is scheduled and not active yet.";
  }

  if (promotion.endsAt && promotion.endsAt.getTime() < now.getTime()) {
    return "Coupon has expired.";
  }

  if (
    promotion.usageLimit !== null &&
    promotion.usageCount >= promotion.usageLimit
  ) {
    return "Coupon usage limit has been reached.";
  }

  return null;
}

function getPromotionRuntimeStatus(
  promotion: Promotion,
  now: Date,
): Exclude<AdminPromotionStatusFilter, "all"> {
  if (!promotion.isActive) {
    return "inactive";
  }

  if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) {
    return "scheduled";
  }

  if (promotion.endsAt && promotion.endsAt.getTime() < now.getTime()) {
    return "expired";
  }

  return "active";
}

function buildMongoPromotionStatusFilter(
  status: AdminPromotionStatusFilter,
  now: Date,
): Record<string, unknown> {
  if (status === "inactive") {
    return { isActive: false };
  }
  if (status === "scheduled") {
    return {
      isActive: true,
      startsAt: { $gt: now },
    };
  }
  if (status === "expired") {
    return {
      isActive: true,
      endsAt: { $lt: now },
    };
  }
  if (status === "active") {
    return {
      isActive: true,
      $and: [
        {
          $or: [{ startsAt: null }, { startsAt: { $lte: now } }],
        },
        {
          $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
        },
      ],
    };
  }
  return {};
}

function buildMongoPromotionFilter(params: {
  query: string;
  status: AdminPromotionStatusFilter;
  triggerType: PromotionTriggerType | "all";
  stackMode: PromotionStackMode | "all";
  now: Date;
}): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (params.query) {
    const queryRegex = new RegExp(escapeRegex(params.query), "i");
    conditions.push({
      $or: [
        { id: queryRegex },
        { code: queryRegex },
        { name: queryRegex },
        { description: queryRegex },
      ],
    });
  }

  if (params.status !== "all") {
    conditions.push(buildMongoPromotionStatusFilter(params.status, params.now));
  }
  if (params.triggerType !== "all") {
    conditions.push({ triggerType: params.triggerType });
  }
  if (params.stackMode !== "all") {
    conditions.push({ stackMode: params.stackMode });
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

async function getMongoPromotionStatusStats(
  collection: Collection<PromotionDocument>,
  now: Date,
): Promise<AdminPromotionsPage["stats"]> {
  const [active, scheduled, expired, inactive] = await Promise.all([
    collection.countDocuments(buildMongoPromotionStatusFilter("active", now)),
    collection.countDocuments(
      buildMongoPromotionStatusFilter("scheduled", now),
    ),
    collection.countDocuments(buildMongoPromotionStatusFilter("expired", now)),
    collection.countDocuments(buildMongoPromotionStatusFilter("inactive", now)),
  ]);

  return {
    active,
    scheduled,
    expired,
    inactive,
  };
}

interface DiscountAllocationResult {
  totalAllocatedCents: number;
  allocationByLineKey: Map<string, number>;
}

function allocateDiscountAcrossLines(
  eligibleLines: Array<{ lineKey: string; remainingCents: number }>,
  requestedDiscountCents: number,
): DiscountAllocationResult {
  const eligibleSubtotal = eligibleLines.reduce(
    (sum, line) => sum + line.remainingCents,
    0,
  );
  if (eligibleSubtotal <= 0) {
    return {
      totalAllocatedCents: 0,
      allocationByLineKey: new Map(),
    };
  }

  const targetDiscount = Math.min(
    Math.max(requestedDiscountCents, 0),
    eligibleSubtotal,
  );
  if (targetDiscount <= 0) {
    return {
      totalAllocatedCents: 0,
      allocationByLineKey: new Map(),
    };
  }

  const allocationByLineKey = new Map<string, number>();
  let allocatedCents = 0;

  for (const line of eligibleLines) {
    const provisional = Math.min(
      line.remainingCents,
      Math.floor((line.remainingCents * targetDiscount) / eligibleSubtotal),
    );
    allocationByLineKey.set(line.lineKey, provisional);
    allocatedCents += provisional;
  }

  let remainder = targetDiscount - allocatedCents;
  if (remainder > 0) {
    const orderedLines = [...eligibleLines].sort(
      (a, b) => b.remainingCents - a.remainingCents,
    );

    while (remainder > 0) {
      let progressed = false;

      for (const line of orderedLines) {
        if (remainder <= 0) {
          break;
        }

        const current = allocationByLineKey.get(line.lineKey) ?? 0;
        if (current >= line.remainingCents) {
          continue;
        }

        allocationByLineKey.set(line.lineKey, current + 1);
        remainder -= 1;
        progressed = true;
      }

      if (!progressed) {
        break;
      }
    }
  }

  const totalAllocatedCents = Array.from(allocationByLineKey.values()).reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    totalAllocatedCents,
    allocationByLineKey,
  };
}

async function getPromotionsCollection(): Promise<Collection<PromotionDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<PromotionDocument>(
    process.env.MONGODB_PROMOTIONS_COLLECTION || "promotions",
  );
  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex({ code: 1 }, { unique: true });
  await collection.createIndex({
    isActive: 1,
    startsAt: 1,
    endsAt: 1,
    priority: 1,
  });
  return collection;
}

export async function getAllPromotions(): Promise<Promotion[]> {
  const collection = await getPromotionsCollection();
  if (!collection) {
    return [];
  }

  const docs = await collection
    .find({})
    .sort({ priority: 1, updatedAt: -1 })
    .toArray();
  return docs
    .map((doc) => toPromotion(doc))
    .filter((promotion): promotion is Promotion => promotion !== null);
}

function buildInMemoryAdminPromotionsPage(params: {
  promotions: Promotion[];
  query: string;
  status: AdminPromotionStatusFilter;
  triggerType: PromotionTriggerType | "all";
  stackMode: PromotionStackMode | "all";
  page: number;
  pageSize: number;
  now: Date;
}): AdminPromotionsPage {
  const stats = {
    active: 0,
    scheduled: 0,
    expired: 0,
    inactive: 0,
  };

  for (const promotion of params.promotions) {
    const runtimeStatus = getPromotionRuntimeStatus(promotion, params.now);
    stats[runtimeStatus] += 1;
  }

  const filtered = params.promotions
    .filter((promotion) => {
      if (params.status !== "all") {
        const runtimeStatus = getPromotionRuntimeStatus(promotion, params.now);
        if (runtimeStatus !== params.status) {
          return false;
        }
      }

      if (
        params.triggerType !== "all" &&
        promotion.triggerType !== params.triggerType
      ) {
        return false;
      }
      if (
        params.stackMode !== "all" &&
        promotion.stackMode !== params.stackMode
      ) {
        return false;
      }

      if (!params.query) {
        return true;
      }

      const searchableText =
        `${promotion.id} ${promotion.code} ${promotion.name} ${promotion.description}`.toLowerCase();
      return searchableText.includes(params.query.toLowerCase());
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      if (left.updatedAt.getTime() !== right.updatedAt.getTime()) {
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      }
      return left.id.localeCompare(right.id);
    });

  const pagination = createPaginationMeta({
    page: params.page,
    pageSize: params.pageSize,
    total: filtered.length,
  });
  const start = (pagination.page - 1) * pagination.pageSize;

  return {
    promotions: filtered.slice(start, start + pagination.pageSize),
    pagination,
    stats,
  };
}

export async function getAdminPromotionsPage(
  query: AdminPromotionsQuery,
): Promise<AdminPromotionsPage> {
  const now = new Date();
  const normalizedQuery = normalizeSearchQuery(query.q);
  const normalizedStatus = normalizeAdminStatus(query.status);
  const normalizedTriggerType = normalizeTriggerFilter(query.triggerType);
  const normalizedStackMode = normalizeStackFilter(query.stackMode);
  const requestedPage = Number(query.page || 1);
  const requestedPageSize = Number(query.pageSize || 24);

  try {
    const collection = await getPromotionsCollection();
    if (collection) {
      const [stats, total] = await Promise.all([
        getMongoPromotionStatusStats(collection, now),
        collection.countDocuments(
          buildMongoPromotionFilter({
            query: normalizedQuery,
            status: normalizedStatus,
            triggerType: normalizedTriggerType,
            stackMode: normalizedStackMode,
            now,
          }),
        ),
      ]);

      const pagination = createPaginationMeta({
        page: requestedPage,
        pageSize: requestedPageSize,
        total,
      });
      const skip = (pagination.page - 1) * pagination.pageSize;

      const docs =
        total > 0
          ? await collection
              .find(
                buildMongoPromotionFilter({
                  query: normalizedQuery,
                  status: normalizedStatus,
                  triggerType: normalizedTriggerType,
                  stackMode: normalizedStackMode,
                  now,
                }),
              )
              .sort({ priority: 1, updatedAt: -1, id: 1 })
              .skip(skip)
              .limit(pagination.pageSize)
              .toArray()
          : [];

      const promotions = docs
        .map((doc) => toPromotion(doc))
        .filter((promotion): promotion is Promotion => promotion !== null);

      return {
        promotions,
        pagination,
        stats,
      };
    }
  } catch (error) {
    void error;
  }

  return buildInMemoryAdminPromotionsPage({
    promotions: await getAllPromotions(),
    query: normalizedQuery,
    status: normalizedStatus,
    triggerType: normalizedTriggerType,
    stackMode: normalizedStackMode,
    page: requestedPage,
    pageSize: requestedPageSize,
    now,
  });
}

export async function getPromotionByCode(
  code: string,
): Promise<Promotion | null> {
  const collection = await getPromotionsCollection();
  if (!collection) {
    return null;
  }

  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return null;
  }

  const doc = await collection.findOne({ code: normalizedCode });
  return toPromotion(doc ?? undefined);
}

export async function upsertPromotion(
  input: PromotionUpsertInput,
): Promise<Promotion> {
  const collection = await getPromotionsCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for promotions.");
  }

  const normalizedCode = normalizeCode(input.code);
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(normalizedCode)) {
    throw new Error(
      "Promotion code must be 3-32 chars and use A-Z, 0-9, dash.",
    );
  }

  const trimmedName = input.name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 80) {
    throw new Error("Promotion name must be between 2 and 80 characters.");
  }

  if (!discountTypeSet.has(input.discountType)) {
    throw new Error("Invalid discount type.");
  }

  const triggerType = triggerTypeSet.has(
    input.triggerType as PromotionTriggerType,
  )
    ? (input.triggerType as PromotionTriggerType)
    : "code";
  const stackMode = stackModeSet.has(input.stackMode as PromotionStackMode)
    ? (input.stackMode as PromotionStackMode)
    : "exclusive";
  const priority = clampInteger(input.priority ?? 100, 0, 1000);
  const scope = normalizeScope(input.scope);

  const value = clampInteger(input.discountValue, 1, 2_000_000);
  if (input.discountType === "percent" && value > 100) {
    throw new Error("Percent discount must be between 1 and 100.");
  }

  const minSubtotalCents = clampInteger(
    input.minSubtotalCents ?? 0,
    0,
    20_000_000,
  );
  const maxDiscountCents =
    typeof input.maxDiscountCents === "number" && input.maxDiscountCents > 0
      ? clampInteger(input.maxDiscountCents, 1, 20_000_000)
      : null;
  const usageLimit =
    typeof input.usageLimit === "number" && input.usageLimit > 0
      ? clampInteger(input.usageLimit, 1, 1_000_000)
      : null;
  const startsAt = asDateOrNull(input.startsAt ?? null);
  const endsAt = asDateOrNull(input.endsAt ?? null);

  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("Promotion end date must be after the start date.");
  }

  const id = normalizeId(input.id || buildPromotionId(normalizedCode));
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(id)) {
    throw new Error("Invalid promotion id.");
  }

  const now = new Date();

  await collection.updateOne(
    { id },
    {
      $set: {
        id,
        code: normalizedCode,
        name: trimmedName,
        description: (input.description || "").trim().slice(0, 240),
        triggerType,
        stackMode,
        priority,
        scope,
        discountType: input.discountType,
        discountValue: value,
        minSubtotalCents,
        maxDiscountCents,
        startsAt,
        endsAt,
        isActive: input.isActive !== false,
        usageLimit,
        updatedAt: now,
      },
      $setOnInsert: {
        usageCount: 0,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const saved = await collection.findOne({ id });
  const parsed = toPromotion(saved ?? undefined);
  if (!parsed) {
    throw new Error("Promotion was saved but could not be read.");
  }

  return parsed;
}

export async function deletePromotionById(id: string): Promise<void> {
  const collection = await getPromotionsCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for promotions.");
  }

  const normalizedId = normalizeId(id);
  if (!normalizedId) {
    throw new Error("Invalid promotion id.");
  }

  await collection.deleteOne({ id: normalizedId });
}

export function calculatePromotionDiscount(
  promotion: Promotion,
  subtotalCents: number,
): number {
  const safeSubtotal = Math.max(Math.floor(subtotalCents), 0);
  if (safeSubtotal === 0) {
    return 0;
  }

  let discountCents =
    promotion.discountType === "percent"
      ? Math.floor((safeSubtotal * promotion.discountValue) / 100)
      : promotion.discountValue;

  if (promotion.maxDiscountCents !== null) {
    discountCents = Math.min(discountCents, promotion.maxDiscountCents);
  }

  return Math.min(Math.max(discountCents, 0), safeSubtotal);
}

export async function resolvePromotionsForCart(params: {
  items: PromotionCartItem[];
  code?: string | null;
  now?: Date;
}): Promise<PromotionResolution> {
  const now = params.now ?? new Date();
  const normalizedItems = params.items
    .map((item) => normalizeCartItem(item))
    .filter((item): item is PromotionCartItem => item !== null);
  const subtotalCents = normalizedItems.reduce(
    (sum, item) => sum + getItemSubtotalCents(item),
    0,
  );

  const allPromotions = await getAllPromotions();
  const enteredCode =
    typeof params.code === "string" ? normalizeCode(params.code) : "";

  const candidatePromotions: Promotion[] = [];
  let codeReason: string | null = null;
  let selectedCodePromotionId: string | null = null;
  let selectedCodeFallbackReason: string | null = null;

  for (const promotion of allPromotions) {
    if (promotion.triggerType !== "automatic") {
      continue;
    }

    const reason = getPromotionInactiveReason(promotion, now);
    if (!reason) {
      candidatePromotions.push(promotion);
    }
  }

  if (enteredCode) {
    const codePromotion = allPromotions.find(
      (promotion) =>
        promotion.code === enteredCode && promotion.triggerType === "code",
    );

    if (!codePromotion) {
      codeReason = "Coupon code was not found.";
    } else {
      selectedCodePromotionId = codePromotion.id;
      const reason = getPromotionInactiveReason(codePromotion, now);
      if (reason) {
        codeReason = reason;
      } else {
        candidatePromotions.push(codePromotion);
      }
    }
  }

  candidatePromotions.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
      return a.updatedAt.getTime() - b.updatedAt.getTime();
    }
    return a.id.localeCompare(b.id);
  });

  const remainingByLineKey = new Map<string, number>();
  normalizedItems.forEach((item, index) => {
    remainingByLineKey.set(String(index), getItemSubtotalCents(item));
  });

  const appliedPromotions: AppliedPromotionResult[] = [];
  let totalDiscountCents = 0;

  for (const promotion of candidatePromotions) {
    const eligibleLines: Array<{ lineKey: string; remainingCents: number }> =
      [];
    let eligibleSubtotalCents = 0;

    for (let index = 0; index < normalizedItems.length; index += 1) {
      const lineKey = String(index);
      const remainingCents = remainingByLineKey.get(lineKey) || 0;
      if (remainingCents <= 0) {
        continue;
      }

      if (!matchesPromotionScope(normalizedItems[index], promotion)) {
        continue;
      }

      eligibleLines.push({ lineKey, remainingCents });
      eligibleSubtotalCents += remainingCents;
    }

    if (eligibleSubtotalCents <= 0) {
      if (selectedCodePromotionId === promotion.id) {
        selectedCodeFallbackReason =
          "Coupon does not match products in this cart.";
      }
      continue;
    }

    if (eligibleSubtotalCents < promotion.minSubtotalCents) {
      if (selectedCodePromotionId === promotion.id) {
        selectedCodeFallbackReason = `Minimum eligible subtotal is ${formatPrice(
          promotion.minSubtotalCents,
        )}.`;
      }
      continue;
    }

    const requestedDiscountCents = calculatePromotionDiscount(
      promotion,
      eligibleSubtotalCents,
    );
    if (requestedDiscountCents <= 0) {
      if (selectedCodePromotionId === promotion.id) {
        selectedCodeFallbackReason = "Coupon does not apply to this cart.";
      }
      continue;
    }

    const allocation = allocateDiscountAcrossLines(
      eligibleLines,
      requestedDiscountCents,
    );
    if (allocation.totalAllocatedCents <= 0) {
      continue;
    }

    for (const [
      lineKey,
      allocatedCents,
    ] of allocation.allocationByLineKey.entries()) {
      if (allocatedCents <= 0) {
        continue;
      }
      const remaining = remainingByLineKey.get(lineKey) || 0;
      remainingByLineKey.set(lineKey, Math.max(remaining - allocatedCents, 0));
    }

    totalDiscountCents += allocation.totalAllocatedCents;
    appliedPromotions.push({
      id: promotion.id,
      code: promotion.code,
      name: promotion.name,
      triggerType: promotion.triggerType,
      stackMode: promotion.stackMode,
      priority: promotion.priority,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      discountCents: allocation.totalAllocatedCents,
      eligibleSubtotalCents,
    });

    if (promotion.stackMode === "exclusive") {
      break;
    }
  }

  if (enteredCode && !codeReason && selectedCodePromotionId) {
    const appliedCodePromotion = appliedPromotions.some(
      (promotion) => promotion.id === selectedCodePromotionId,
    );
    if (!appliedCodePromotion) {
      codeReason =
        selectedCodeFallbackReason || "Coupon does not apply to this cart.";
    }
  }

  const finalSubtotalCents = Math.max(subtotalCents - totalDiscountCents, 0);

  return {
    valid: codeReason === null,
    reason: codeReason,
    subtotalCents,
    totalDiscountCents,
    finalSubtotalCents,
    appliedPromotions,
  };
}

export async function evaluatePromotionCode(params: {
  code: string;
  subtotalCents: number;
  now?: Date;
}): Promise<{
  valid: boolean;
  reason: string | null;
  promotion: Promotion | null;
  subtotalCents: number;
  discountCents: number;
  finalSubtotalCents: number;
}> {
  const subtotalCents = Math.max(Math.floor(params.subtotalCents), 0);
  const virtualItem: PromotionCartItem = {
    id: "virtual-subtotal-item",
    sport: "all",
    category: "all",
    quantity: 1,
    unitAmountCents: subtotalCents,
  };
  const resolution = await resolvePromotionsForCart({
    code: params.code,
    items: [virtualItem],
    now: params.now,
  });

  const normalizedCode = normalizeCode(params.code);
  const codePromotion = resolution.appliedPromotions.find(
    (promotion) => promotion.code === normalizedCode,
  );

  const promotion = codePromotion
    ? await getPromotionByCode(codePromotion.code)
    : null;

  if (!resolution.valid || !codePromotion || !promotion) {
    return {
      valid: false,
      reason: resolution.reason ?? "Coupon does not apply to this cart.",
      promotion: null,
      subtotalCents,
      discountCents: 0,
      finalSubtotalCents: subtotalCents,
    };
  }

  return {
    valid: true,
    reason: null,
    promotion,
    subtotalCents: resolution.subtotalCents,
    discountCents: codePromotion.discountCents,
    finalSubtotalCents: resolution.finalSubtotalCents,
  };
}

export async function incrementPromotionsUsage(
  promotionIds: string[],
): Promise<void> {
  const collection = await getPromotionsCollection();
  if (!collection) {
    return;
  }

  const normalizedIds = Array.from(
    new Set(
      promotionIds
        .map((promotionId) => normalizeId(promotionId))
        .filter((promotionId) => promotionId.length > 0),
    ),
  );
  if (normalizedIds.length === 0) {
    return;
  }

  const now = new Date();
  await collection.updateMany(
    { id: { $in: normalizedIds } },
    {
      $inc: {
        usageCount: 1,
      },
      $set: {
        updatedAt: now,
      },
    },
  );
}

export async function incrementPromotionUsage(
  promotionId: string,
): Promise<void> {
  await incrementPromotionsUsage([promotionId]);
}

export function formatPromotionMinimumSubtotal(
  minSubtotalCents: number,
): string {
  return formatPrice(minSubtotalCents);
}
