import "server-only";

import { randomBytes } from "crypto";

import { hashSessionToken, normalizeEmail } from "@/lib/auth";
import {
  AuthTokenType,
  consumeAuthToken,
  createAuthTokenRecord,
  revokeOutstandingAuthTokens,
} from "@/lib/auth-tokens-repository";
import { sendTransactionalEmail } from "@/lib/mailer";

const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

function resolveAppOrigin(request: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
  }

  return "http://localhost:3000";
}

function shouldExposeDebugLink(): boolean {
  if (process.env.EXPOSE_AUTH_DEBUG_LINKS?.trim().toLowerCase() === "true") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

async function issueAuthLinkToken(params: {
  type: AuthTokenType;
  userId: string;
  email: string;
  ttlSeconds: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000);

  await revokeOutstandingAuthTokens({
    userId: params.userId,
    type: params.type,
  });
  await createAuthTokenRecord({
    tokenHash,
    type: params.type,
    userId: params.userId,
    email: normalizeEmail(params.email),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function sendVerificationEmail(params: {
  request: Request;
  userId: string;
  email: string;
  displayName: string;
}): Promise<{ delivered: boolean; debugUrl?: string }> {
  const appOrigin = resolveAppOrigin(params.request);
  const issued = await issueAuthLinkToken({
    type: "verify_email",
    userId: params.userId,
    email: params.email,
    ttlSeconds: EMAIL_VERIFICATION_TTL_SECONDS,
  });
  const verifyUrl = `${appOrigin}/auth/verify-email?token=${encodeURIComponent(issued.token)}`;

  const subject = "Verify your Prime Athlete account";
  const text = [
    `Hi ${params.displayName},`,
    "",
    "Please verify your Prime Athlete account by opening this link:",
    verifyUrl,
    "",
    `This link expires at ${issued.expiresAt.toISOString()}.`,
  ].join("\n");
  const html = [
    `<p>Hi ${params.displayName},</p>`,
    "<p>Please verify your Prime Athlete account by clicking the link below:</p>",
    `<p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    `<p>This link expires at <strong>${issued.expiresAt.toISOString()}</strong>.</p>`,
  ].join("");

  const result = await sendTransactionalEmail({
    to: params.email,
    subject,
    text,
    html,
  });

  if (!result.delivered && shouldExposeDebugLink()) {
    return { delivered: false, debugUrl: verifyUrl };
  }

  return { delivered: result.delivered };
}

export async function sendPasswordResetEmail(params: {
  request: Request;
  userId: string;
  email: string;
  displayName: string;
}): Promise<{ delivered: boolean; debugUrl?: string }> {
  const appOrigin = resolveAppOrigin(params.request);
  const issued = await issueAuthLinkToken({
    type: "password_reset",
    userId: params.userId,
    email: params.email,
    ttlSeconds: PASSWORD_RESET_TTL_SECONDS,
  });
  const resetUrl = `${appOrigin}/auth/reset-password?token=${encodeURIComponent(issued.token)}`;

  const subject = "Reset your Prime Athlete password";
  const text = [
    `Hi ${params.displayName},`,
    "",
    "Use this link to reset your password:",
    resetUrl,
    "",
    `This link expires at ${issued.expiresAt.toISOString()}.`,
  ].join("\n");
  const html = [
    `<p>Hi ${params.displayName},</p>`,
    "<p>Use this link to reset your password:</p>",
    `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
    `<p>This link expires at <strong>${issued.expiresAt.toISOString()}</strong>.</p>`,
  ].join("");

  const result = await sendTransactionalEmail({
    to: params.email,
    subject,
    text,
    html,
  });

  if (!result.delivered && shouldExposeDebugLink()) {
    return { delivered: false, debugUrl: resetUrl };
  }

  return { delivered: result.delivered };
}

export async function consumeVerificationToken(
  token: string,
): Promise<{ userId: string; email: string } | null> {
  return consumeAuthToken({
    tokenHash: hashSessionToken(token),
    type: "verify_email",
  });
}

export async function consumePasswordResetToken(
  token: string,
): Promise<{ userId: string; email: string } | null> {
  return consumeAuthToken({
    tokenHash: hashSessionToken(token),
    type: "password_reset",
  });
}
