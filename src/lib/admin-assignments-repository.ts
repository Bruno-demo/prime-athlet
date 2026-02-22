import "server-only";

import { Collection, ObjectId } from "mongodb";

import { AdminRole } from "@/lib/admin-roles";
import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

interface AdminAssignmentDocument {
  _id: ObjectId;
  email: string;
  role: AdminRole | null;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByEmail: string | null;
  updatedByEmail: string | null;
}

export interface AdminAssignmentOverride {
  email: string;
  role: AdminRole | null;
  disabled: boolean;
  source: "database";
  createdAt: string;
  updatedAt: string;
  createdByEmail: string | null;
  updatedByEmail: string | null;
}

const validAdminRoles = new Set<AdminRole>([
  "owner",
  "manager",
  "support",
  "analyst",
]);

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function mapOverride(
  document: AdminAssignmentDocument,
): AdminAssignmentOverride {
  return {
    email: document.email,
    role: document.role,
    disabled: document.disabled,
    source: "database",
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    createdByEmail: document.createdByEmail,
    updatedByEmail: document.updatedByEmail,
  };
}

async function getAdminAssignmentsCollection(): Promise<Collection<AdminAssignmentDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<AdminAssignmentDocument>(
    process.env.MONGODB_ADMIN_ASSIGNMENTS_COLLECTION || "admin_assignments",
  );
  await collection.createIndex({ email: 1 }, { unique: true });
  await collection.createIndex({ updatedAt: -1 });
  return collection;
}

export async function getAdminAssignmentOverrideByEmail(
  email: string,
): Promise<AdminAssignmentOverride | null> {
  const collection = await getAdminAssignmentsCollection();
  if (!collection) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const doc = await collection.findOne({ email: normalizedEmail });
  return doc ? mapOverride(doc) : null;
}

export async function listAdminAssignmentOverrides(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
}): Promise<{
  overrides: AdminAssignmentOverride[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  const page = Math.min(Math.max(Math.floor(params?.page ?? 1), 1), 100_000);
  const pageSize = Math.min(
    Math.max(Math.floor(params?.pageSize ?? 20), 1),
    100,
  );

  const collection = await getAdminAssignmentsCollection();
  if (!collection) {
    return {
      overrides: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 1,
      },
    };
  }

  const q = typeof params?.q === "string" ? params.q.trim() : "";
  const filter =
    q.length > 0
      ? {
          email: {
            $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
          },
        }
      : {};

  const [total, docs] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ]);

  return {
    overrides: docs.map((doc) => mapOverride(doc)),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function setAdminRoleOverride(params: {
  email: string;
  role: AdminRole;
  actorEmail?: string | null;
}): Promise<AdminAssignmentOverride | null> {
  const collection = await getAdminAssignmentsCollection();
  if (!collection) {
    return null;
  }

  const normalizedEmail = normalizeEmail(params.email);
  if (!normalizedEmail || !validAdminRoles.has(params.role)) {
    return null;
  }

  const actorEmail = params.actorEmail
    ? normalizeEmail(params.actorEmail)
    : null;
  const now = new Date();

  await collection.updateOne(
    { email: normalizedEmail },
    {
      $set: {
        email: normalizedEmail,
        role: params.role,
        disabled: false,
        updatedAt: now,
        updatedByEmail: actorEmail,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        createdAt: now,
        createdByEmail: actorEmail,
      },
    },
    { upsert: true },
  );

  const updated = await collection.findOne({ email: normalizedEmail });
  return updated ? mapOverride(updated) : null;
}

export async function revokeAdminAccessOverride(params: {
  email: string;
  actorEmail?: string | null;
}): Promise<AdminAssignmentOverride | null> {
  const collection = await getAdminAssignmentsCollection();
  if (!collection) {
    return null;
  }

  const normalizedEmail = normalizeEmail(params.email);
  if (!normalizedEmail) {
    return null;
  }

  const actorEmail = params.actorEmail
    ? normalizeEmail(params.actorEmail)
    : null;
  const now = new Date();

  await collection.updateOne(
    { email: normalizedEmail },
    {
      $set: {
        email: normalizedEmail,
        role: null,
        disabled: true,
        updatedAt: now,
        updatedByEmail: actorEmail,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        createdAt: now,
        createdByEmail: actorEmail,
      },
    },
    { upsert: true },
  );

  const updated = await collection.findOne({ email: normalizedEmail });
  return updated ? mapOverride(updated) : null;
}
