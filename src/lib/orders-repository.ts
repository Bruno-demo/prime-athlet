import { Collection } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";
import {
  calculateOrderTotalCents,
  calculateShippingCents,
  deriveShippingCentsFromOrderLike,
} from "@/lib/shipping";

export interface OrderLineItem {
  id: string;
  productId?: string;
  name: string;
  quantity: number;
  unitAmountCents: number;
  size?: string;
  color?: string;
}

export type OrderStatus =
  | "created"
  | "completed"
  | "expired"
  | "payment_failed";
export type OrderPaymentProvider =
  | "stripe"
  | "paypal"
  | "bank_transfer"
  | "manual";
export type OrderFulfillmentStatus = "unfulfilled" | "fulfilled" | "cancelled";
export type AppliedPromotionDiscountType = "percent" | "fixed";
export type AppliedPromotionTriggerType = "code" | "automatic";
export type AppliedPromotionStackMode = "stackable" | "exclusive";

export interface AppliedPromotionSnapshot {
  id: string;
  code: string;
  name: string;
  triggerType: AppliedPromotionTriggerType;
  stackMode: AppliedPromotionStackMode;
  priority: number;
  discountType: AppliedPromotionDiscountType;
  discountValue: number;
  discountCents: number;
}

interface OrderDocument {
  stripeSessionId: string;
  status: OrderStatus;
  paymentProvider?: OrderPaymentProvider;
  externalPaymentId?: string | null;
  paymentStatus: string;
  customerEmail: string | null;
  fulfillmentStatus?: OrderFulfillmentStatus;
  fulfilledAt?: Date | null;
  cancelledAt?: Date | null;
  refundedAt?: Date | null;
  refundId?: string | null;
  items: OrderLineItem[];
  subtotalCents: number;
  discountCents?: number;
  shippingCents?: number;
  promotions?: AppliedPromotionSnapshot[];
  promotion?: AppliedPromotionSnapshot | null;
  totalCents: number | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerOrderSummary {
  stripeSessionId: string;
  status: OrderStatus;
  paymentProvider: OrderPaymentProvider;
  externalPaymentId: string | null;
  paymentStatus: string;
  fulfillmentStatus?: OrderFulfillmentStatus;
  refundedAt?: Date | null;
  items: OrderLineItem[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  promotions: AppliedPromotionSnapshot[];
  totalCents: number | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderMetrics {
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  failedOrders: number;
  totalRevenueCents: number;
}

export interface OrderTimeSeriesPoint {
  key: string;
  label: string;
  revenueCents: number;
  orderCount: number;
  completedCount: number;
  failedCount: number;
  activeCount: number;
}

export interface UpdateOrderStatusResult {
  becameCompleted: boolean;
  appliedPromotions: AppliedPromotionSnapshot[];
}

export interface AdminOrderSummary extends CustomerOrderSummary {
  customerEmail: string | null;
  fulfillmentStatus: OrderFulfillmentStatus;
  fulfilledAt: Date | null;
  cancelledAt: Date | null;
  refundedAt: Date | null;
  refundId: string | null;
}

export interface AdminOrdersPageQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: OrderStatus | "all";
  fulfillmentStatus?: OrderFulfillmentStatus | "all";
  paymentStatus?: string | "all";
  createdFrom?: Date | null;
  createdTo?: Date | null;
}

export interface AdminOrdersPageResult {
  orders: AdminOrderSummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type AdminOrderAction = "fulfill" | "cancel" | "refund" | "mark_paid";

export class OrderActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderActionError";
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function normalizePromotion(value: unknown): AppliedPromotionSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AppliedPromotionSnapshot>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.code !== "string" ||
    typeof candidate.name !== "string" ||
    (candidate.discountType !== "percent" && candidate.discountType !== "fixed")
  ) {
    return null;
  }

  const discountValue = asNumber(candidate.discountValue);
  const discountCents = asNumber(candidate.discountCents);
  if (discountValue === null || discountCents === null) {
    return null;
  }

  return {
    id: candidate.id,
    code: candidate.code,
    name: candidate.name,
    triggerType: candidate.triggerType === "automatic" ? "automatic" : "code",
    stackMode: candidate.stackMode === "stackable" ? "stackable" : "exclusive",
    priority:
      typeof candidate.priority === "number" &&
      !Number.isNaN(candidate.priority)
        ? Math.min(Math.max(Math.floor(candidate.priority), 0), 1000)
        : 100,
    discountType: candidate.discountType,
    discountValue: Math.floor(discountValue),
    discountCents: Math.max(Math.floor(discountCents), 0),
  };
}

function normalizePromotions(value: unknown): AppliedPromotionSnapshot[] {
  if (!Array.isArray(value)) {
    const singlePromotion = normalizePromotion(value);
    return singlePromotion ? [singlePromotion] : [];
  }

  const promotions = value
    .map((promotion) => normalizePromotion(promotion))
    .filter(
      (promotion): promotion is AppliedPromotionSnapshot => promotion !== null,
    );

  return promotions;
}

function normalizeDiscountCents(value: unknown): number {
  const parsed = asNumber(value);
  if (parsed === null) {
    return 0;
  }
  return Math.max(Math.floor(parsed), 0);
}

function getOrderShippingCents(order: {
  shippingCents?: unknown;
  subtotalCents: number;
  discountCents?: unknown;
  totalCents?: number | null;
}): number {
  return deriveShippingCentsFromOrderLike({
    shippingCents:
      typeof order.shippingCents === "number" ? order.shippingCents : null,
    subtotalCents: order.subtotalCents,
    discountCents:
      typeof order.discountCents === "number" ? order.discountCents : null,
    totalCents: typeof order.totalCents === "number" ? order.totalCents : null,
  });
}

function normalizeOrderLineItem(value: unknown): OrderLineItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<OrderLineItem>;
  if (
    typeof candidate.id !== "string" ||
    candidate.id.trim().length === 0 ||
    typeof candidate.name !== "string" ||
    candidate.name.trim().length === 0 ||
    typeof candidate.quantity !== "number" ||
    Number.isNaN(candidate.quantity) ||
    candidate.quantity <= 0 ||
    typeof candidate.unitAmountCents !== "number" ||
    Number.isNaN(candidate.unitAmountCents) ||
    candidate.unitAmountCents < 0
  ) {
    return null;
  }
  const size =
    typeof candidate.size === "string" && candidate.size.trim().length > 0
      ? candidate.size.trim()
      : "One Size";
  const color =
    typeof candidate.color === "string" && candidate.color.trim().length > 0
      ? candidate.color.trim()
      : "Standard";
  return {
    id: candidate.id.trim(),
    productId:
      typeof candidate.productId === "string" && candidate.productId.trim().length > 0
        ? candidate.productId.trim()
        : candidate.id.trim(),
    name: candidate.name.trim(),
    quantity: Math.max(1, Math.min(999, Math.floor(candidate.quantity))),
    unitAmountCents: Math.max(0, Math.floor(candidate.unitAmountCents)),
    size,
    color,
  };
}

function normalizeOrderLineItems(value: unknown): OrderLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeOrderLineItem(item))
    .filter((item): item is OrderLineItem => item !== null);
}

function normalizeFulfillmentStatus(value: unknown): OrderFulfillmentStatus {
  if (value === "fulfilled") {
    return "fulfilled";
  }
  if (value === "cancelled") {
    return "cancelled";
  }
  return "unfulfilled";
}

function normalizeDateOrNull(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeExternalPaymentId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePaymentProvider(
  value: unknown,
  stripeSessionId: string,
): OrderPaymentProvider {
  if (
    value === "stripe" ||
    value === "paypal" ||
    value === "bank_transfer" ||
    value === "manual"
  ) {
    return value;
  }

  if (stripeSessionId.startsWith("paypal_")) {
    return "paypal";
  }
  if (stripeSessionId.startsWith("bank_")) {
    return "bank_transfer";
  }

  return "stripe";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getOrderSettledTotalCents(order: {
  subtotalCents: number;
  totalCents: number | null;
  discountCents?: number;
  shippingCents?: number;
  refundedAt?: Date | null;
}): number {
  if (normalizeDateOrNull(order.refundedAt)) {
    return 0;
  }

  if (typeof order.totalCents === "number" && order.totalCents >= 0) {
    return Math.floor(order.totalCents);
  }
  const shippingCents = getOrderShippingCents(order);
  return calculateOrderTotalCents({
    subtotalCents: order.subtotalCents,
    discountCents: normalizeDiscountCents(order.discountCents),
    shippingCents,
  });
}

function toAdminOrderSummary(order: OrderDocument): AdminOrderSummary {
  const shippingCents = getOrderShippingCents(order);
  return {
    stripeSessionId: order.stripeSessionId,
    status: order.status,
    paymentProvider: normalizePaymentProvider(
      order.paymentProvider,
      order.stripeSessionId,
    ),
    externalPaymentId: normalizeExternalPaymentId(order.externalPaymentId),
    paymentStatus: order.paymentStatus,
    customerEmail: normalizeCustomerEmail(order.customerEmail),
    fulfillmentStatus: normalizeFulfillmentStatus(order.fulfillmentStatus),
    fulfilledAt: normalizeDateOrNull(order.fulfilledAt),
    cancelledAt: normalizeDateOrNull(order.cancelledAt),
    refundedAt: normalizeDateOrNull(order.refundedAt),
    refundId:
      typeof order.refundId === "string" && order.refundId.trim().length > 0
        ? order.refundId.trim()
        : null,
    items: normalizeOrderLineItems(order.items),
    subtotalCents: order.subtotalCents,
    discountCents: normalizeDiscountCents(order.discountCents),
    shippingCents,
    promotions: normalizePromotions(
      order.promotions ?? order.promotion ?? null,
    ),
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function formatMonthKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

function formatDayKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function buildMonthlyTimeline(
  monthCount: number,
): Array<{ key: string; label: string; start: Date }> {
  const safeCount = Math.min(Math.max(Math.floor(monthCount), 1), 24);
  const now = new Date();
  const timeline: Array<{ key: string; label: string; start: Date }> = [];

  for (let offset = safeCount - 1; offset >= 0; offset -= 1) {
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );
    timeline.push({
      key: formatMonthKey(monthStart),
      label: monthStart.toLocaleString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      start: monthStart,
    });
  }

  return timeline;
}

function buildDailyTimeline(
  dayCount: number,
): Array<{ key: string; label: string; start: Date }> {
  const safeCount = Math.min(Math.max(Math.floor(dayCount), 1), 60);
  const now = new Date();
  const timeline: Array<{ key: string; label: string; start: Date }> = [];

  for (let offset = safeCount - 1; offset >= 0; offset -= 1) {
    const dayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - offset,
      ),
    );
    timeline.push({
      key: formatDayKey(dayStart),
      label: `${dayStart.getUTCMonth() + 1}/${dayStart.getUTCDate()}`,
      start: dayStart,
    });
  }

  return timeline;
}

async function getOrdersCollection(): Promise<Collection<OrderDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<OrderDocument>(
    process.env.MONGODB_ORDERS_COLLECTION || "orders",
  );
  await collection.createIndex({ stripeSessionId: 1 }, { unique: true });
  await collection.createIndex({ paymentProvider: 1, createdAt: -1 });
  await collection.createIndex({ customerEmail: 1, createdAt: -1 });
  await collection.createIndex({ createdAt: -1 });
  return collection;
}

function normalizeCustomerEmail(email?: string | null): string | null {
  if (!email) {
    return null;
  }

  return email.trim().toLowerCase();
}

export async function createPendingOrder(params: {
  stripeSessionId: string;
  paymentProvider?: OrderPaymentProvider;
  externalPaymentId?: string | null;
  paymentStatus: string;
  customerEmail?: string | null;
  items: OrderLineItem[];
  subtotalCents: number;
  discountCents?: number;
  shippingCents?: number;
  promotions?: AppliedPromotionSnapshot[];
  totalCents?: number | null;
  currency: string;
}): Promise<void> {
  const collection = await getOrdersCollection();
  if (!collection) {
    return;
  }

  const now = new Date();
  const subtotalCents = Math.max(Math.floor(params.subtotalCents), 0);
  const discountCents = normalizeDiscountCents(params.discountCents);
  const shippingCents =
    typeof params.shippingCents === "number" && params.shippingCents >= 0
      ? Math.floor(params.shippingCents)
      : calculateShippingCents({ subtotalCents });
  const expectedTotalCents = calculateOrderTotalCents({
    subtotalCents,
    discountCents,
    shippingCents,
  });
  const totalCents =
    typeof params.totalCents === "number" && params.totalCents >= 0
      ? Math.floor(params.totalCents)
      : params.totalCents === null
        ? null
        : expectedTotalCents;

  await collection.updateOne(
    { stripeSessionId: params.stripeSessionId },
    {
      $set: {
        stripeSessionId: params.stripeSessionId,
        status: "created",
        paymentProvider: params.paymentProvider || "stripe",
        externalPaymentId: normalizeExternalPaymentId(params.externalPaymentId),
        paymentStatus: params.paymentStatus,
        customerEmail: normalizeCustomerEmail(params.customerEmail),
        fulfillmentStatus: "unfulfilled",
        fulfilledAt: null,
        cancelledAt: null,
        refundedAt: null,
        refundId: null,
        items: normalizeOrderLineItems(params.items),
        subtotalCents,
        discountCents,
        shippingCents,
        promotions: normalizePromotions(params.promotions),
        totalCents,
        currency: params.currency,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

export async function updateOrderStatus(params: {
  stripeSessionId: string;
  status: OrderStatus;
  paymentStatus: string;
  totalCents?: number | null;
  customerEmail?: string | null;
}): Promise<UpdateOrderStatusResult> {
  const collection = await getOrdersCollection();
  if (!collection) {
    return {
      becameCompleted: false,
      appliedPromotions: [],
    };
  }

  const hasTotalCents =
    typeof params.totalCents === "number" && params.totalCents >= 0;
  const totalCents =
    typeof params.totalCents === "number" && params.totalCents >= 0
      ? Math.floor(params.totalCents)
      : null;
  const customerEmailUpdate =
    typeof params.customerEmail === "undefined"
      ? {}
      : { customerEmail: normalizeCustomerEmail(params.customerEmail) };
  const now = new Date();

  if (params.status === "completed") {
    const transitionedOrder = await collection.findOneAndUpdate(
      {
        stripeSessionId: params.stripeSessionId,
        status: { $ne: "completed" },
      },
      {
        $set: {
          status: params.status,
          paymentStatus: params.paymentStatus,
          ...(hasTotalCents ? { totalCents } : {}),
          ...customerEmailUpdate,
          updatedAt: now,
        },
      },
      {
        returnDocument: "before",
      },
    );

    if (transitionedOrder) {
      return {
        becameCompleted: true,
        appliedPromotions: normalizePromotions(
          transitionedOrder.promotions ?? transitionedOrder.promotion ?? null,
        ),
      };
    }
  }

  const existing = await collection.findOne({
    stripeSessionId: params.stripeSessionId,
  });

  await collection.updateOne(
    { stripeSessionId: params.stripeSessionId },
    {
      $set: {
        status: params.status,
        paymentStatus: params.paymentStatus,
        ...(hasTotalCents ? { totalCents } : {}),
        ...customerEmailUpdate,
        updatedAt: now,
      },
    },
  );

  return {
    becameCompleted: false,
    appliedPromotions: normalizePromotions(
      existing?.promotions ?? existing?.promotion ?? null,
    ),
  };
}

export async function getOrdersByCustomerEmail(
  customerEmail: string,
  options?: { limit?: number },
): Promise<CustomerOrderSummary[]> {
  const collection = await getOrdersCollection();
  if (!collection) {
    return [];
  }

  const normalizedEmail = normalizeCustomerEmail(customerEmail);
  if (!normalizedEmail) {
    return [];
  }

  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const orders = await collection
    .find({ customerEmail: normalizedEmail })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return orders.map((order) => ({
    stripeSessionId: order.stripeSessionId,
    status: order.status,
    paymentProvider: normalizePaymentProvider(
      order.paymentProvider,
      order.stripeSessionId,
    ),
    externalPaymentId: normalizeExternalPaymentId(order.externalPaymentId),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: normalizeFulfillmentStatus(order.fulfillmentStatus),
    refundedAt: normalizeDateOrNull(order.refundedAt),
    items: normalizeOrderLineItems(order.items),
    subtotalCents: order.subtotalCents,
    discountCents: normalizeDiscountCents(order.discountCents),
    shippingCents: getOrderShippingCents(order),
    promotions: normalizePromotions(
      order.promotions ?? order.promotion ?? null,
    ),
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }));
}

export async function getOrderMetrics(): Promise<OrderMetrics> {
  const collection = await getOrdersCollection();
  if (!collection) {
    return {
      totalOrders: 0,
      activeOrders: 0,
      completedOrders: 0,
      failedOrders: 0,
      totalRevenueCents: 0,
    };
  }

  const orders = await collection.find({}).toArray();
  const totalRevenueCents = orders
    .filter((order) => order.status === "completed")
    .reduce((sum, order) => sum + getOrderSettledTotalCents(order), 0);

  return {
    totalOrders: orders.length,
    activeOrders: orders.filter((order) => order.status === "created").length,
    completedOrders: orders.filter((order) => order.status === "completed")
      .length,
    failedOrders: orders.filter((order) => order.status === "payment_failed")
      .length,
    totalRevenueCents,
  };
}

export async function getRecentOrders(
  limit = 20,
): Promise<CustomerOrderSummary[]> {
  const collection = await getOrdersCollection();
  if (!collection) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const orders = await collection
    .find({})
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();

  return orders.map((order) => ({
    stripeSessionId: order.stripeSessionId,
    status: order.status,
    paymentProvider: normalizePaymentProvider(
      order.paymentProvider,
      order.stripeSessionId,
    ),
    externalPaymentId: normalizeExternalPaymentId(order.externalPaymentId),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: normalizeFulfillmentStatus(order.fulfillmentStatus),
    refundedAt: normalizeDateOrNull(order.refundedAt),
    items: normalizeOrderLineItems(order.items),
    subtotalCents: order.subtotalCents,
    discountCents: normalizeDiscountCents(order.discountCents),
    shippingCents: getOrderShippingCents(order),
    promotions: normalizePromotions(
      order.promotions ?? order.promotion ?? null,
    ),
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }));
}

export async function getRecentAdminOrders(
  limit = 20,
): Promise<AdminOrderSummary[]> {
  const collection = await getOrdersCollection();
  if (!collection) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const orders = await collection
    .find({})
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();
  return orders.map((order) => toAdminOrderSummary(order));
}

export async function getAdminOrdersPage(
  query: AdminOrdersPageQuery,
): Promise<AdminOrdersPageResult> {
  const page = Math.min(Math.max(Math.floor(query.page ?? 1), 1), 100_000);
  const pageSize = Math.min(Math.max(Math.floor(query.pageSize ?? 20), 1), 100);

  const collection = await getOrdersCollection();
  if (!collection) {
    return {
      orders: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 1,
      },
    };
  }

  const filter: Record<string, unknown> = {};
  if (query.status && query.status !== "all") {
    filter.status = query.status;
  }
  if (query.fulfillmentStatus && query.fulfillmentStatus !== "all") {
    filter.fulfillmentStatus = query.fulfillmentStatus;
  }
  if (
    typeof query.paymentStatus === "string" &&
    query.paymentStatus.trim().length > 0 &&
    query.paymentStatus !== "all"
  ) {
    filter.paymentStatus = query.paymentStatus.trim().toLowerCase();
  }

  if (query.createdFrom || query.createdTo) {
    const createdAtFilter: Record<string, unknown> = {};
    if (query.createdFrom) {
      createdAtFilter.$gte = query.createdFrom;
    }
    if (query.createdTo) {
      createdAtFilter.$lte = query.createdTo;
    }
    filter.createdAt = createdAtFilter;
  }

  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (q.length > 0) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { stripeSessionId: regex },
      { externalPaymentId: regex },
      { customerEmail: regex },
    ];
  }

  const [total, docs] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ]);

  return {
    orders: docs.map((doc) => toAdminOrderSummary(doc)),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getAdminOrderBySessionId(
  stripeSessionId: string,
): Promise<AdminOrderSummary | null> {
  const collection = await getOrdersCollection();
  if (!collection) {
    return null;
  }

  const normalizedSessionId = stripeSessionId.trim();
  if (normalizedSessionId.length < 4) {
    return null;
  }

  const order = await collection.findOne({
    stripeSessionId: normalizedSessionId,
  });
  if (!order) {
    return null;
  }

  return toAdminOrderSummary(order);
}

export async function applyAdminOrderAction(params: {
  stripeSessionId: string;
  action: AdminOrderAction;
  refundId?: string | null;
}): Promise<AdminOrderSummary | null> {
  const collection = await getOrdersCollection();
  if (!collection) {
    throw new Error("MongoDB is unavailable for order operations.");
  }

  const normalizedSessionId = params.stripeSessionId.trim();
  if (normalizedSessionId.length < 4) {
    throw new OrderActionError("Invalid order identifier.");
  }

  const existing = await collection.findOne({
    stripeSessionId: normalizedSessionId,
  });
  if (!existing) {
    return null;
  }

  const now = new Date();
  const fulfillmentStatus = normalizeFulfillmentStatus(
    existing.fulfillmentStatus,
  );
  const refundedAt = normalizeDateOrNull(existing.refundedAt);
  const paymentProvider = normalizePaymentProvider(
    existing.paymentProvider,
    existing.stripeSessionId,
  );

  if (params.action === "mark_paid") {
    if (paymentProvider !== "bank_transfer") {
      throw new OrderActionError(
        "Only bank-transfer orders can be marked paid.",
      );
    }
    if (existing.status === "completed") {
      throw new OrderActionError("Order is already marked paid.");
    }
    if (existing.status !== "created") {
      throw new OrderActionError(
        "Only awaiting bank-transfer orders can be marked paid.",
      );
    }
    if (existing.paymentStatus !== "awaiting_transfer") {
      throw new OrderActionError(
        "Only awaiting-transfer orders can be marked paid.",
      );
    }
    if (refundedAt) {
      throw new OrderActionError("Refunded orders cannot be marked paid.");
    }
    if (fulfillmentStatus === "cancelled") {
      throw new OrderActionError("Cancelled orders cannot be marked paid.");
    }

    await collection.updateOne(
      { stripeSessionId: normalizedSessionId },
      {
        $set: {
          status: "completed",
          paymentStatus: "paid",
          totalCents: calculateOrderTotalCents({
            subtotalCents: existing.subtotalCents,
            discountCents: normalizeDiscountCents(existing.discountCents),
            shippingCents: getOrderShippingCents(existing),
          }),
          updatedAt: now,
        },
      },
    );
  } else if (params.action === "fulfill") {
    if (existing.status !== "completed") {
      throw new OrderActionError("Only completed payments can be fulfilled.");
    }
    if (refundedAt) {
      throw new OrderActionError("Refunded orders cannot be fulfilled.");
    }
    if (fulfillmentStatus === "cancelled") {
      throw new OrderActionError("Cancelled orders cannot be fulfilled.");
    }
    if (fulfillmentStatus === "fulfilled") {
      throw new OrderActionError("Order is already fulfilled.");
    }

    await collection.updateOne(
      { stripeSessionId: normalizedSessionId },
      {
        $set: {
          fulfillmentStatus: "fulfilled",
          fulfilledAt: now,
          updatedAt: now,
        },
      },
    );
  } else if (params.action === "cancel") {
    if (fulfillmentStatus === "fulfilled") {
      throw new OrderActionError("Fulfilled orders cannot be cancelled.");
    }
    if (fulfillmentStatus === "cancelled") {
      throw new OrderActionError("Order is already cancelled.");
    }

    await collection.updateOne(
      { stripeSessionId: normalizedSessionId },
      {
        $set: {
          fulfillmentStatus: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        },
      },
    );
  } else if (params.action === "refund") {
    if (existing.status !== "completed") {
      throw new OrderActionError("Only completed payments can be refunded.");
    }
    if (refundedAt) {
      throw new OrderActionError("Order is already refunded.");
    }

    await collection.updateOne(
      { stripeSessionId: normalizedSessionId },
      {
        $set: {
          refundedAt: now,
          refundId: params.refundId || null,
          paymentStatus: "refunded",
          updatedAt: now,
          fulfillmentStatus:
            fulfillmentStatus === "fulfilled" ? "fulfilled" : "cancelled",
          cancelledAt:
            fulfillmentStatus === "fulfilled"
              ? normalizeDateOrNull(existing.cancelledAt)
              : now,
        },
      },
    );
  } else {
    throw new OrderActionError("Unsupported order action.");
  }

  const updated = await collection.findOne({
    stripeSessionId: normalizedSessionId,
  });
  if (!updated) {
    return null;
  }

  return toAdminOrderSummary(updated);
}

export async function getMonthlyOrderTimeSeries(
  monthCount = 6,
): Promise<OrderTimeSeriesPoint[]> {
  const timeline = buildMonthlyTimeline(monthCount);
  const collection = await getOrdersCollection();
  if (!collection) {
    return timeline.map((point) => ({
      key: point.key,
      label: point.label,
      revenueCents: 0,
      orderCount: 0,
      completedCount: 0,
      failedCount: 0,
      activeCount: 0,
    }));
  }

  const startDate = timeline[0]?.start;
  if (!startDate) {
    return [];
  }

  const orders = await collection
    .find(
      { createdAt: { $gte: startDate } },
      {
        projection: {
          createdAt: 1,
          status: 1,
          subtotalCents: 1,
          totalCents: 1,
          discountCents: 1,
          shippingCents: 1,
          refundedAt: 1,
        },
      },
    )
    .toArray();

  const byKey = new Map<
    string,
    {
      revenueCents: number;
      orderCount: number;
      completedCount: number;
      failedCount: number;
      activeCount: number;
    }
  >();

  for (const point of timeline) {
    byKey.set(point.key, {
      revenueCents: 0,
      orderCount: 0,
      completedCount: 0,
      failedCount: 0,
      activeCount: 0,
    });
  }

  for (const order of orders) {
    const key = formatMonthKey(order.createdAt);
    const bucket = byKey.get(key);
    if (!bucket) {
      continue;
    }

    bucket.orderCount += 1;

    if (order.status === "completed") {
      bucket.completedCount += 1;
      bucket.revenueCents += getOrderSettledTotalCents(order);
    } else if (order.status === "payment_failed") {
      bucket.failedCount += 1;
    } else if (order.status === "created") {
      bucket.activeCount += 1;
    }
  }

  return timeline.map((point) => {
    const bucket = byKey.get(point.key);
    return {
      key: point.key,
      label: point.label,
      revenueCents: bucket?.revenueCents ?? 0,
      orderCount: bucket?.orderCount ?? 0,
      completedCount: bucket?.completedCount ?? 0,
      failedCount: bucket?.failedCount ?? 0,
      activeCount: bucket?.activeCount ?? 0,
    };
  });
}

export async function getDailyOrderTimeSeries(
  dayCount = 14,
): Promise<OrderTimeSeriesPoint[]> {
  const timeline = buildDailyTimeline(dayCount);
  const collection = await getOrdersCollection();
  if (!collection) {
    return timeline.map((point) => ({
      key: point.key,
      label: point.label,
      revenueCents: 0,
      orderCount: 0,
      completedCount: 0,
      failedCount: 0,
      activeCount: 0,
    }));
  }

  const startDate = timeline[0]?.start;
  if (!startDate) {
    return [];
  }

  const orders = await collection
    .find(
      { createdAt: { $gte: startDate } },
      {
        projection: {
          createdAt: 1,
          status: 1,
          subtotalCents: 1,
          totalCents: 1,
          discountCents: 1,
          shippingCents: 1,
          refundedAt: 1,
        },
      },
    )
    .toArray();

  const byKey = new Map<
    string,
    {
      revenueCents: number;
      orderCount: number;
      completedCount: number;
      failedCount: number;
      activeCount: number;
    }
  >();

  for (const point of timeline) {
    byKey.set(point.key, {
      revenueCents: 0,
      orderCount: 0,
      completedCount: 0,
      failedCount: 0,
      activeCount: 0,
    });
  }

  for (const order of orders) {
    const key = formatDayKey(order.createdAt);
    const bucket = byKey.get(key);
    if (!bucket) {
      continue;
    }

    bucket.orderCount += 1;

    if (order.status === "completed") {
      bucket.completedCount += 1;
      bucket.revenueCents += getOrderSettledTotalCents(order);
    } else if (order.status === "payment_failed") {
      bucket.failedCount += 1;
    } else if (order.status === "created") {
      bucket.activeCount += 1;
    }
  }

  return timeline.map((point) => {
    const bucket = byKey.get(point.key);
    return {
      key: point.key,
      label: point.label,
      revenueCents: bucket?.revenueCents ?? 0,
      orderCount: bucket?.orderCount ?? 0,
      completedCount: bucket?.completedCount ?? 0,
      failedCount: bucket?.failedCount ?? 0,
      activeCount: bucket?.activeCount ?? 0,
    };
  });
}
