import "server-only";

import { randomBytes } from "crypto";
import { Collection, ObjectId } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

export type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "awaiting_customer"
  | "resolved"
  | "closed";

export type SupportTicketPriority = "low" | "normal" | "high" | "urgent";

export type SupportTicketCategory =
  | "order"
  | "payment"
  | "account"
  | "technical"
  | "return"
  | "other";

const SUPPORT_TICKET_STATUS_VALUES: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "awaiting_customer",
  "resolved",
  "closed",
];

const SUPPORT_TICKET_PRIORITY_VALUES: SupportTicketPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

const SUPPORT_TICKET_CATEGORY_VALUES: SupportTicketCategory[] = [
  "order",
  "payment",
  "account",
  "technical",
  "return",
  "other",
];

interface SupportTicketDocument {
  _id: ObjectId;
  code: string;
  userId: string | null;
  customerEmail: string;
  customerName: string;
  subject: string;
  message: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  orderReference: string | null;
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

interface SupportTicketFilter {
  $and?: Array<Record<string, unknown>>;
  $or?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface SupportTicket {
  id: string;
  code: string;
  userId: string | null;
  customerEmail: string;
  customerName: string;
  subject: string;
  message: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  orderReference: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface SupportTicketsPage {
  tickets: SupportTicket[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminSupportTicketsPage extends SupportTicketsPage {
  filters: {
    statuses: SupportTicketStatus[];
    priorities: SupportTicketPriority[];
    categories: SupportTicketCategory[];
  };
}

export interface CreateSupportTicketInput {
  userId?: string | null;
  customerEmail: string;
  customerName: string;
  subject: string;
  message: string;
  category: SupportTicketCategory;
  orderReference?: string | null;
}

export interface UpdateSupportTicketByAdminInput {
  ticketId: string;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  adminNote?: string | null;
}

export interface UpdateSupportTicketByAdminResult {
  changed: boolean;
  ticket: SupportTicket;
}

function normalizeText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeEmail(value: string): string {
  return normalizeText(value, 320).toLowerCase();
}

function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizeText(value, maxLength);
  return normalized.length > 0 ? normalized : null;
}

function sanitizeCategory(value: string): SupportTicketCategory {
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUPPORT_TICKET_CATEGORY_VALUES.includes(
    normalized as SupportTicketCategory,
  )
    ? (normalized as SupportTicketCategory)
    : "other";
}

function sanitizePriority(value: string): SupportTicketPriority {
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUPPORT_TICKET_PRIORITY_VALUES.includes(
    normalized as SupportTicketPriority,
  )
    ? (normalized as SupportTicketPriority)
    : "normal";
}

function sanitizeStatus(value: string): SupportTicketStatus {
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUPPORT_TICKET_STATUS_VALUES.includes(
    normalized as SupportTicketStatus,
  )
    ? (normalized as SupportTicketStatus)
    : "open";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseObjectId(value: string): ObjectId | null {
  if (!ObjectId.isValid(value)) {
    return null;
  }
  return new ObjectId(value);
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 11000;
}

function generateSupportTicketCode(): string {
  const timestampPart = Date.now().toString(36).toUpperCase();
  const randomPart = randomBytes(2).toString("hex").toUpperCase();
  return `SUP-${timestampPart}-${randomPart}`;
}

function mapSupportTicket(doc: SupportTicketDocument): SupportTicket {
  return {
    id: doc._id.toHexString(),
    code: doc.code,
    userId: doc.userId,
    customerEmail: doc.customerEmail,
    customerName: doc.customerName,
    subject: doc.subject,
    message: doc.message,
    category: doc.category,
    priority: doc.priority,
    status: doc.status,
    orderReference: doc.orderReference,
    adminNote: doc.adminNote,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    resolvedAt: doc.resolvedAt ? doc.resolvedAt.toISOString() : null,
  };
}

function createPagination(params: {
  page: number;
  pageSize: number;
  total: number;
}): {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} {
  const pageSize = Math.min(Math.max(Math.floor(params.pageSize), 1), 100);
  const total = Math.max(Math.floor(params.total), 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.floor(params.page), 1), totalPages);
  return {
    page,
    pageSize,
    total,
    totalPages,
  };
}

async function getSupportTicketsCollection(): Promise<Collection<SupportTicketDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<SupportTicketDocument>(
    process.env.MONGODB_SUPPORT_TICKETS_COLLECTION || "support_tickets",
  );

  await collection.createIndex({ code: 1 }, { unique: true });
  await collection.createIndex({ userId: 1, updatedAt: -1 });
  await collection.createIndex({ customerEmail: 1, updatedAt: -1 });
  await collection.createIndex({ status: 1, priority: 1, updatedAt: -1 });
  await collection.createIndex({ category: 1, updatedAt: -1 });
  await collection.createIndex({ updatedAt: -1 });

  return collection;
}

function buildUserSupportFilter(params: {
  userId: string;
  customerEmail: string;
  q: string;
  status: SupportTicketStatus | "all";
}): SupportTicketFilter {
  const andFilters: Array<Record<string, unknown>> = [];

  if (params.userId) {
    andFilters.push({
      $or: [{ userId: params.userId }, { customerEmail: params.customerEmail }],
    });
  } else {
    andFilters.push({ customerEmail: params.customerEmail });
  }

  if (params.status !== "all") {
    andFilters.push({ status: params.status });
  }

  if (params.q) {
    const queryRegex = new RegExp(escapeRegex(params.q), "i");
    andFilters.push({
      $or: [
        { code: queryRegex },
        { subject: queryRegex },
        { message: queryRegex },
        { orderReference: queryRegex },
      ],
    });
  }

  if (andFilters.length === 1) {
    return andFilters[0] || {};
  }
  return { $and: andFilters };
}

function buildAdminSupportFilter(params: {
  q: string;
  status: SupportTicketStatus | "all";
  priority: SupportTicketPriority | "all";
  category: SupportTicketCategory | "all";
}): SupportTicketFilter | Record<string, never> {
  const andFilters: Array<Record<string, unknown>> = [];

  if (params.status !== "all") {
    andFilters.push({ status: params.status });
  }
  if (params.priority !== "all") {
    andFilters.push({ priority: params.priority });
  }
  if (params.category !== "all") {
    andFilters.push({ category: params.category });
  }
  if (params.q) {
    const queryRegex = new RegExp(escapeRegex(params.q), "i");
    andFilters.push({
      $or: [
        { code: queryRegex },
        { customerName: queryRegex },
        { customerEmail: queryRegex },
        { subject: queryRegex },
        { message: queryRegex },
        { orderReference: queryRegex },
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

export function parseSupportTicketStatus(
  value: string | null | undefined,
): SupportTicketStatus | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUPPORT_TICKET_STATUS_VALUES.includes(
    normalized as SupportTicketStatus,
  )
    ? (normalized as SupportTicketStatus)
    : null;
}

export function parseSupportTicketPriority(
  value: string | null | undefined,
): SupportTicketPriority | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUPPORT_TICKET_PRIORITY_VALUES.includes(
    normalized as SupportTicketPriority,
  )
    ? (normalized as SupportTicketPriority)
    : null;
}

export function parseSupportTicketCategory(
  value: string | null | undefined,
): SupportTicketCategory | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeText(value, 40).toLowerCase();
  return SUPPORT_TICKET_CATEGORY_VALUES.includes(
    normalized as SupportTicketCategory,
  )
    ? (normalized as SupportTicketCategory)
    : null;
}

export function getSupportTicketStatuses(): SupportTicketStatus[] {
  return [...SUPPORT_TICKET_STATUS_VALUES];
}

export function getSupportTicketPriorities(): SupportTicketPriority[] {
  return [...SUPPORT_TICKET_PRIORITY_VALUES];
}

export function getSupportTicketCategories(): SupportTicketCategory[] {
  return [...SUPPORT_TICKET_CATEGORY_VALUES];
}

export async function createSupportTicket(
  input: CreateSupportTicketInput,
): Promise<SupportTicket> {
  const collection = await getSupportTicketsCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for support tickets.");
  }

  const customerEmail = normalizeEmail(input.customerEmail);
  const customerName = normalizeText(input.customerName, 120);
  const subject = normalizeText(input.subject, 180);
  const message = normalizeText(input.message, 5_000);
  const category = sanitizeCategory(input.category);
  const orderReference = normalizeOptionalText(input.orderReference, 120);
  const userId = normalizeOptionalText(input.userId, 120);

  if (!customerEmail || !customerName || !subject || !message) {
    throw new Error("Invalid support ticket payload.");
  }

  const now = new Date();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc: SupportTicketDocument = {
      _id: new ObjectId(),
      code: generateSupportTicketCode(),
      userId,
      customerEmail,
      customerName,
      subject,
      message,
      category,
      priority: "normal",
      status: "open",
      orderReference,
      adminNote: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };

    try {
      await collection.insertOne(doc);
      return mapSupportTicket(doc);
    } catch (error) {
      if (attempt < 4 && isDuplicateKeyError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to create support ticket.");
}

export async function getSupportTicketsForUser(params: {
  userId: string;
  customerEmail: string;
  page?: number;
  pageSize?: number;
  q?: string;
  status?: SupportTicketStatus | "all";
}): Promise<SupportTicketsPage> {
  const collection = await getSupportTicketsCollection();
  if (!collection) {
    return {
      tickets: [],
      pagination: {
        page: 1,
        pageSize: Math.min(Math.max(Math.floor(params.pageSize || 10), 1), 100),
        total: 0,
        totalPages: 1,
      },
    };
  }

  const pageInput = Number(params.page || 1);
  const pageSizeInput = Number(params.pageSize || 10);
  const q = normalizeText(params.q || "", 200);
  const status = params.status || "all";
  const userId = normalizeText(params.userId || "", 120);
  const customerEmail = normalizeEmail(params.customerEmail || "");

  const filter = buildUserSupportFilter({
    userId,
    customerEmail,
    q,
    status,
  });

  const total = await collection.countDocuments(filter);
  const pagination = createPagination({
    page: pageInput,
    pageSize: pageSizeInput,
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

  return {
    tickets: docs.map((doc) => mapSupportTicket(doc)),
    pagination,
  };
}

export async function getAdminSupportTicketsPage(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: SupportTicketStatus | "all";
  priority?: SupportTicketPriority | "all";
  category?: SupportTicketCategory | "all";
}): Promise<AdminSupportTicketsPage> {
  const collection = await getSupportTicketsCollection();
  const pageInput = Number(params?.page || 1);
  const pageSizeInput = Number(params?.pageSize || 20);
  const emptyPagination = createPagination({
    page: pageInput,
    pageSize: pageSizeInput,
    total: 0,
  });

  if (!collection) {
    return {
      tickets: [],
      pagination: emptyPagination,
      filters: {
        statuses: getSupportTicketStatuses(),
        priorities: getSupportTicketPriorities(),
        categories: getSupportTicketCategories(),
      },
    };
  }

  const q = normalizeText(params?.q || "", 200);
  const status = params?.status || "all";
  const priority = params?.priority || "all";
  const category = params?.category || "all";
  const filter = buildAdminSupportFilter({
    q,
    status,
    priority,
    category,
  });

  const total = await collection.countDocuments(filter);
  const pagination = createPagination({
    page: pageInput,
    pageSize: pageSizeInput,
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

  return {
    tickets: docs.map((doc) => mapSupportTicket(doc)),
    pagination,
    filters: {
      statuses: getSupportTicketStatuses(),
      priorities: getSupportTicketPriorities(),
      categories: getSupportTicketCategories(),
    },
  };
}

export async function updateSupportTicketByAdmin(
  input: UpdateSupportTicketByAdminInput,
): Promise<UpdateSupportTicketByAdminResult> {
  const collection = await getSupportTicketsCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for support tickets.");
  }

  const ticketObjectId = parseObjectId(input.ticketId);
  if (!ticketObjectId) {
    throw new Error("Invalid support ticket id.");
  }

  const existing = await collection.findOne({ _id: ticketObjectId });
  if (!existing) {
    throw new Error("Support ticket not found.");
  }

  const nextStatus = input.status
    ? sanitizeStatus(input.status)
    : existing.status;
  const nextPriority = input.priority
    ? sanitizePriority(input.priority)
    : existing.priority;
  const nextAdminNote =
    input.adminNote !== undefined
      ? normalizeOptionalText(input.adminNote, 2_000)
      : existing.adminNote;

  const changed =
    nextStatus !== existing.status ||
    nextPriority !== existing.priority ||
    nextAdminNote !== existing.adminNote;

  if (!changed) {
    return {
      changed: false,
      ticket: mapSupportTicket(existing),
    };
  }

  const now = new Date();
  const resolvedAt =
    nextStatus === "resolved" || nextStatus === "closed" ? now : null;

  await collection.updateOne(
    { _id: ticketObjectId },
    {
      $set: {
        status: nextStatus,
        priority: nextPriority,
        adminNote: nextAdminNote,
        resolvedAt,
        updatedAt: now,
      },
    },
  );

  const updated = await collection.findOne({ _id: ticketObjectId });
  if (!updated) {
    throw new Error("Unable to load updated support ticket.");
  }

  return {
    changed: true,
    ticket: mapSupportTicket(updated),
  };
}
