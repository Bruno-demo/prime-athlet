import "server-only";

import { Collection, ObjectId } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

export type AuthTokenType = "verify_email" | "password_reset";

interface AuthTokenDocument {
  _id: ObjectId;
  tokenHash: string;
  type: AuthTokenType;
  userId: ObjectId;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  consumedAt: Date | null;
}

async function getAuthTokensCollection(): Promise<Collection<AuthTokenDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<AuthTokenDocument>(
    process.env.MONGODB_AUTH_TOKENS_COLLECTION || "auth_tokens",
  );
  await collection.createIndex({ tokenHash: 1 }, { unique: true });
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await collection.createIndex({ userId: 1, type: 1, createdAt: -1 });
  return collection;
}

export async function createAuthTokenRecord(params: {
  tokenHash: string;
  type: AuthTokenType;
  userId: string;
  email: string;
  expiresAt: Date;
}): Promise<void> {
  const collection = await getAuthTokensCollection();
  if (!collection || !ObjectId.isValid(params.userId)) {
    return;
  }

  await collection.insertOne({
    _id: new ObjectId(),
    tokenHash: params.tokenHash,
    type: params.type,
    userId: new ObjectId(params.userId),
    email: params.email.trim().toLowerCase(),
    expiresAt: params.expiresAt,
    createdAt: new Date(),
    consumedAt: null,
  });
}

export async function consumeAuthToken(params: {
  tokenHash: string;
  type: AuthTokenType;
}): Promise<{ userId: string; email: string } | null> {
  const collection = await getAuthTokensCollection();
  if (!collection) {
    return null;
  }

  const now = new Date();
  const result = await collection.findOneAndUpdate(
    {
      tokenHash: params.tokenHash,
      type: params.type,
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        consumedAt: now,
      },
    },
    {
      returnDocument: "before",
    },
  );

  if (!result) {
    return null;
  }

  return {
    userId: result.userId.toHexString(),
    email: result.email,
  };
}

export async function revokeOutstandingAuthTokens(params: {
  userId: string;
  type: AuthTokenType;
}): Promise<void> {
  const collection = await getAuthTokensCollection();
  if (!collection || !ObjectId.isValid(params.userId)) {
    return;
  }

  await collection.updateMany(
    {
      userId: new ObjectId(params.userId),
      type: params.type,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        consumedAt: new Date(),
      },
    },
  );
}

export async function getActiveAuthTokenByTypeForUser(params: {
  userId: string;
  type: AuthTokenType;
}): Promise<{ tokenHash: string; expiresAt: Date } | null> {
  const collection = await getAuthTokensCollection();
  if (!collection || !ObjectId.isValid(params.userId)) {
    return null;
  }

  const now = new Date();
  const token = await collection.findOne(
    {
      userId: new ObjectId(params.userId),
      type: params.type,
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { sort: { createdAt: -1 } },
  );

  if (!token) {
    return null;
  }

  return {
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt,
  };
}
