import { NextResponse } from "next/server";

import {
  createSessionForUser,
  getRequestMetadata,
  hashPassword,
  normalizeEmail,
  validatePasswordStrength,
} from "@/lib/auth";
import { consumePasswordResetToken } from "@/lib/auth-email";
import {
  findUserById,
  touchUserLastLogin,
  updateUserPasswordHash,
} from "@/lib/users-repository";

export const runtime = "nodejs";

interface ResetPasswordPayload {
  token: string;
  password: string;
}

interface ResetPasswordParseResult {
  payload: ResetPasswordPayload | null;
  error: string | null;
}

function parseResetPasswordPayload(payload: unknown): ResetPasswordParseResult {
  if (!payload || typeof payload !== "object") {
    return {
      payload: null,
      error: "Invalid request body. Provide reset token and new password.",
    };
  }

  const body = payload as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (token.length < 20 || token.length > 400) {
    return {
      payload: null,
      error: "Reset token is invalid or malformed.",
    };
  }

  if (!validatePasswordStrength(password)) {
    return {
      payload: null,
      error:
        "Weak password. Use 10-72 characters with uppercase, lowercase, number, and symbol.",
    };
  }

  return {
    payload: { token, password },
    error: null,
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = parseResetPasswordPayload(payload);
    if (!parsed.payload) {
      return NextResponse.json(
        { error: parsed.error || "Invalid reset-password payload." },
        { status: 400 },
      );
    }

    const tokenRecord = await consumePasswordResetToken(parsed.payload.token);
    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Reset link is invalid or expired." },
        { status: 400 },
      );
    }

    const user = await findUserById(tokenRecord.userId);
    if (!user || normalizeEmail(user.email) !== normalizeEmail(tokenRecord.email)) {
      return NextResponse.json(
        { error: "Reset link is invalid." },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(parsed.payload.password);
    await updateUserPasswordHash(user.id, passwordHash);

    if (user.emailVerifiedAt) {
      const metadata = getRequestMetadata(request);
      await createSessionForUser({
        userId: user.id,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      });
      await touchUserLastLogin(user.id);
    }

    return NextResponse.json({
      success: true,
      requiresEmailVerification: !user.emailVerifiedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reset password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
