import "server-only";

import { Collection, ObjectId } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

interface SessionDocument {
  _id: ObjectId;
  tokenHash: string;
  userId: ObjectId;
  expiresAt: Date;
  adminMfaVerifiedAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

async function getSessionsCollection(): Promise<Collection<SessionDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<SessionDocument>(
    process.env.MONGODB_SESSIONS_COLLECTION || "sessions",
  );
  await collection.createIndex({ tokenHash: 1 }, { unique: true });
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await collection.createIndex({ userId: 1, expiresAt: -1 });
  return collection;
}

export async function createSession(params: {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  adminMfaVerifiedAt?: Date | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  const collection = await getSessionsCollection();
  if (!collection || !ObjectId.isValid(params.userId)) {
    return;
  }

  const now = new Date();
  await collection.insertOne({
    _id: new ObjectId(),
    tokenHash: params.tokenHash,
    userId: new ObjectId(params.userId),
    expiresAt: params.expiresAt,
    adminMfaVerifiedAt: params.adminMfaVerifiedAt ?? null,
    createdAt: now,
    lastSeenAt: now,
    userAgent: params.userAgent ?? null,
    ipAddress: params.ipAddress ?? null,
  });
}

export async function getSessionByTokenHash(tokenHash: string): Promise<{
  sessionId: string;
  userId: string;
  expiresAt: Date;
  adminMfaVerifiedAt: Date | null;
} | null> {
  const collection = await getSessionsCollection();
  if (!collection) {
    return null;
  }

  const now = new Date();
  const session = await collection.findOne({
    tokenHash,
    expiresAt: { $gt: now },
  });

  if (!session) {
    return null;
  }

  await collection.updateOne(
    { _id: session._id },
    {
      $set: {
        lastSeenAt: now,
      },
    },
  );

  return {
    sessionId: session._id.toHexString(),
    userId: session.userId.toHexString(),
    expiresAt: session.expiresAt,
    adminMfaVerifiedAt: session.adminMfaVerifiedAt ?? null,
  };
}

export async function deleteSessionByTokenHash(
  tokenHash: string,
): Promise<void> {
  const collection = await getSessionsCollection();
  if (!collection) {
    return;
  }

  await collection.deleteOne({ tokenHash });
}

export async function deleteSessionsByUserId(userId: string): Promise<number> {
  const collection = await getSessionsCollection();
  if (!collection || !ObjectId.isValid(userId)) {
    return 0;
  }

  const result = await collection.deleteMany({ userId: new ObjectId(userId) });
  return result.deletedCount;
}
