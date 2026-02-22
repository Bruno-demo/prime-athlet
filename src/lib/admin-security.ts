import "server-only";

import { randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Collection } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

const ADMIN_CSRF_COOKIE_NAME = "sportiva_admin_csrf";
const ADMIN_CSRF_HEADER_NAME = "x-csrf-token";
const ADMIN_CSRF_TTL_SECONDS = 60 * 60 * 8;
const RATE_LIMIT_ERROR =
  "Too many admin changes in a short time. Please wait and retry.";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const mutationRateBuckets = new Map<string, RateLimitBucket>();

interface RateLimitBucketDocument {
  key: string;
  scope: string;
  userId: string;
  ipAddress: string;
  count: number;
  resetAt: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

function isValidCsrfToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,200}$/.test(value);
}

function parseCookieValue(
  cookieHeader: string | null,
  cookieName: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [rawKey, ...rawValueParts] = pair.trim().split("=");
    if (rawKey !== cookieName) {
      continue;
    }

    const rawValue = rawValueParts.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function tokensEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (!host) {
    return false;
  }

  return originUrl.host.toLowerCase() === host.toLowerCase();
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function cleanupRateBuckets(now: number): void {
  for (const [key, bucket] of mutationRateBuckets) {
    if (bucket.resetAt <= now) {
      mutationRateBuckets.delete(key);
    }
  }
}

async function getAdminRateLimitCollection(): Promise<Collection<RateLimitBucketDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<RateLimitBucketDocument>(
    process.env.MONGODB_ADMIN_RATE_LIMITS_COLLECTION || "admin_rate_limits",
  );
  await collection.createIndex({ key: 1 }, { unique: true });
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await collection.createIndex({ scope: 1, userId: 1, resetAt: -1 });
  return collection;
}

export async function issueAdminCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ADMIN_CSRF_COOKIE_NAME)?.value;
  if (existing && isValidCsrfToken(existing)) {
    return existing;
  }

  const token = randomBytes(32).toString("base64url");
  cookieStore.set({
    name: ADMIN_CSRF_COOKIE_NAME,
    value: token,
    maxAge: ADMIN_CSRF_TTL_SECONDS,
    expires: new Date(Date.now() + ADMIN_CSRF_TTL_SECONDS * 1000),
    httpOnly: true,
    secure: isProductionEnvironment(),
    sameSite: "strict",
    path: "/",
  });

  return token;
}

export function requireAdminCsrf(request: Request): NextResponse | null {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const headerToken = request.headers.get(ADMIN_CSRF_HEADER_NAME)?.trim() || "";
  if (!isValidCsrfToken(headerToken)) {
    return NextResponse.json(
      { error: "Missing or invalid CSRF token." },
      { status: 403 },
    );
  }

  const cookieToken = parseCookieValue(
    request.headers.get("cookie"),
    ADMIN_CSRF_COOKIE_NAME,
  );
  if (!cookieToken || !isValidCsrfToken(cookieToken)) {
    return NextResponse.json(
      { error: "CSRF cookie is missing." },
      { status: 403 },
    );
  }

  if (!tokensEqual(headerToken, cookieToken)) {
    return NextResponse.json(
      { error: "CSRF token mismatch." },
      { status: 403 },
    );
  }

  return null;
}

function buildRateLimitErrorResponse(params: {
  limit: number;
  resetAt: number;
  now: number;
}): NextResponse {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((params.resetAt - params.now) / 1000),
  );
  return NextResponse.json(
    { error: RATE_LIMIT_ERROR },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(params.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

function enforceInMemoryRateLimit(params: {
  request: Request;
  userId: string;
  scope: string;
  limit: number;
  windowMs: number;
}): NextResponse | null {
  const now = Date.now();
  cleanupRateBuckets(now);

  const ipAddress = getClientIp(params.request);
  const safeLimit = Math.min(Math.max(Math.floor(params.limit), 1), 500);
  const safeWindowMs = Math.min(
    Math.max(Math.floor(params.windowMs), 1_000),
    10 * 60_000,
  );
  const key = `${params.scope}:${params.userId}:${ipAddress}`;

  const bucket = mutationRateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    mutationRateBuckets.set(key, {
      count: 1,
      resetAt: now + safeWindowMs,
    });
    return null;
  }

  if (bucket.count >= safeLimit) {
    return buildRateLimitErrorResponse({
      limit: safeLimit,
      resetAt: bucket.resetAt,
      now,
    });
  }

  bucket.count += 1;
  mutationRateBuckets.set(key, bucket);
  return null;
}

export async function enforceAdminMutationRateLimit(params: {
  request: Request;
  userId: string;
  scope: string;
  limit: number;
  windowMs: number;
}): Promise<NextResponse | null> {
  const now = Date.now();
  const safeLimit = Math.min(Math.max(Math.floor(params.limit), 1), 500);
  const safeWindowMs = Math.min(
    Math.max(Math.floor(params.windowMs), 1_000),
    10 * 60_000,
  );
  const ipAddress = getClientIp(params.request);
  const windowStart = Math.floor(now / safeWindowMs) * safeWindowMs;
  const resetAt = windowStart + safeWindowMs;
  const key = `${params.scope}:${params.userId}:${ipAddress}:${windowStart}`;

  try {
    const collection = await getAdminRateLimitCollection();
    if (!collection) {
      return enforceInMemoryRateLimit(params);
    }

    const nowDate = new Date(now);
    const doc = await collection.findOneAndUpdate(
      { key },
      {
        $setOnInsert: {
          key,
          scope: params.scope,
          userId: params.userId,
          ipAddress,
          count: 0,
          resetAt,
          createdAt: nowDate,
          expiresAt: new Date(resetAt + 60_000),
        },
        $set: {
          updatedAt: nowDate,
        },
        $inc: {
          count: 1,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    const currentCount = doc?.count ?? 1;
    if (currentCount > safeLimit) {
      return buildRateLimitErrorResponse({
        limit: safeLimit,
        resetAt: doc?.resetAt ?? resetAt,
        now,
      });
    }

    return null;
  } catch {
    return enforceInMemoryRateLimit(params);
  }
}
