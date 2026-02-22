import "server-only";

import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";

import { BillingProfile, AuthUser } from "@/lib/account-types";
import {
  createSession,
  deleteSessionByTokenHash,
  getSessionByTokenHash,
} from "@/lib/sessions-repository";
import { findUserById } from "@/lib/users-repository";

const scryptAsync = promisify(scryptCallback);
const PASSWORD_FORMAT_PREFIX = "scrypt";
const SESSION_COOKIE_NAME = "sportiva_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export interface SessionUser extends AuthUser {
  billingProfile: BillingProfile | null;
  adminMfaVerifiedAt: string | null;
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePasswordStrength(password: string): boolean {
  if (password.length < 10 || password.length > 72) {
    return false;
  }

  return (
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${PASSWORD_FORMAT_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [format, salt, hashHex] = storedHash.split("$");
  if (!format || !salt || !hashHex || format !== PASSWORD_FORMAT_PREFIX) {
    return false;
  }

  const expectedHash = Buffer.from(hashHex, "hex");
  const actualHash = (await scryptAsync(
    password,
    salt,
    expectedHash.length,
  )) as Buffer;
  return timingSafeEqual(expectedHash, actualHash);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSessionForUser(params: {
  userId: string;
  adminMfaVerifiedAt?: Date | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await createSession({
    tokenHash,
    userId: params.userId,
    expiresAt,
    adminMfaVerifiedAt: params.adminMfaVerifiedAt ?? null,
    userAgent: params.userAgent ?? null,
    ipAddress: params.ipAddress ?? null,
  });

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    expires: expiresAt,
    maxAge: SESSION_TTL_SECONDS,
    httpOnly: true,
    secure: isProductionEnvironment(),
    sameSite: "lax",
    path: "/",
  });
}

export async function clearSessionCookieAndRecord(): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    await deleteSessionByTokenHash(hashSessionToken(sessionToken));
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getAuthenticatedUserFromSessionToken(
  sessionToken: string | undefined | null,
): Promise<SessionUser | null> {
  if (!sessionToken) {
    return null;
  }

  const session = await getSessionByTokenHash(hashSessionToken(sessionToken));
  if (!session) {
    return null;
  }

  const user = await findUserById(session.userId);
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    emailVerifiedAt: user.emailVerifiedAt,
    billingProfile: user.billingProfile,
    adminMfaVerifiedAt: session.adminMfaVerifiedAt
      ? session.adminMfaVerifiedAt.toISOString()
      : null,
  };
}

export async function getAuthenticatedUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return getAuthenticatedUserFromSessionToken(sessionToken);
}

export function getRequestMetadata(request: Request): {
  userAgent: string | null;
  ipAddress: string | null;
} {
  const userAgent = request.headers.get("user-agent");
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor
    ? forwardedFor.split(",")[0]?.trim() || null
    : request.headers.get("x-real-ip");

  return {
    userAgent,
    ipAddress,
  };
}
