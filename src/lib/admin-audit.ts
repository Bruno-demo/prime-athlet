import "server-only";

import { Collection, ObjectId } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

export type AdminAuditStatus = "success" | "failure" | "denied";

interface AdminAuditDocument {
  _id: ObjectId;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  status: AdminAuditStatus;
  message: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AdminAuditEvent {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  status: AdminAuditStatus;
  message: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AdminAuditPage {
  events: AdminAuditEvent[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface AdminAuditQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  action?: string;
  resourceType?: string;
  status?: AdminAuditStatus | "all";
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function toSafeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function parseIpFromRequest(
  request: Request | null | undefined,
): string | null {
  if (!request) {
    return null;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp.slice(0, 120);
    }
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp ? realIp.slice(0, 120) : null;
}

function sanitizeMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  try {
    const serialized = JSON.stringify(metadata);
    if (!serialized) {
      return null;
    }
    const capped =
      serialized.length > 8_000 ? serialized.slice(0, 8_000) : serialized;
    const parsed = JSON.parse(capped) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getAdminAuditCollection(): Promise<Collection<AdminAuditDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<AdminAuditDocument>(
    process.env.MONGODB_ADMIN_AUDIT_COLLECTION || "admin_audit_logs",
  );
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ actorEmail: 1, createdAt: -1 });
  await collection.createIndex({ action: 1, createdAt: -1 });
  await collection.createIndex({
    resourceType: 1,
    resourceId: 1,
    createdAt: -1,
  });
  await collection.createIndex({ status: 1, createdAt: -1 });
  return collection;
}

function mapAuditEvent(document: AdminAuditDocument): AdminAuditEvent {
  return {
    id: document._id.toHexString(),
    actorUserId: document.actorUserId,
    actorEmail: document.actorEmail,
    actorRole: document.actorRole,
    action: document.action,
    resourceType: document.resourceType,
    resourceId: document.resourceId,
    status: document.status,
    message: document.message,
    metadata: document.metadata ?? null,
    ipAddress: document.ipAddress ?? null,
    userAgent: document.userAgent ?? null,
    createdAt: document.createdAt.toISOString(),
  };
}

export async function recordAdminAuditEvent(params: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  status: AdminAuditStatus;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  request?: Request | null;
}): Promise<void> {
  try {
    const collection = await getAdminAuditCollection();
    if (!collection) {
      return;
    }

    const now = new Date();
    await collection.insertOne({
      _id: new ObjectId(),
      actorUserId: toSafeString(params.actorUserId ?? null, 120),
      actorEmail: normalizeEmail(params.actorEmail ?? null),
      actorRole: toSafeString(params.actorRole ?? null, 40),
      action: toSafeString(params.action, 120) || "unknown.action",
      resourceType: toSafeString(params.resourceType, 80) || "unknown",
      resourceId: toSafeString(params.resourceId ?? null, 200),
      status: params.status,
      message: toSafeString(params.message ?? null, 400),
      metadata: sanitizeMetadata(params.metadata ?? null),
      ipAddress: parseIpFromRequest(params.request),
      userAgent: toSafeString(params.request?.headers.get("user-agent"), 300),
      createdAt: now,
    });
  } catch {
    // Best-effort logging; do not block admin operations if audit persistence fails.
  }
}

export async function getAdminAuditEventsPage(
  query: AdminAuditQuery,
): Promise<AdminAuditPage> {
  const page = Math.min(Math.max(Math.floor(query.page ?? 1), 1), 100_000);
  const pageSize = Math.min(Math.max(Math.floor(query.pageSize ?? 20), 1), 100);
  const collection = await getAdminAuditCollection();
  if (!collection) {
    return {
      events: [],
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

  const action = toSafeString(query.action, 120);
  if (action && action !== "all") {
    filter.action = action;
  }

  const resourceType = toSafeString(query.resourceType, 80);
  if (resourceType && resourceType !== "all") {
    filter.resourceType = resourceType;
  }

  const q = toSafeString(query.q, 120);
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { actorEmail: regex },
      { resourceId: regex },
      { message: regex },
      { action: regex },
      { resourceType: regex },
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
    events: docs.map((doc) => mapAuditEvent(doc)),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
