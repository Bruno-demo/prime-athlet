import { NextResponse } from "next/server";

import { createSessionForUser, getRequestMetadata, normalizeEmail } from "@/lib/auth";
import { consumeVerificationToken } from "@/lib/auth-email";
import {
  findUserById,
  markUserEmailVerified,
  touchUserLastLogin,
} from "@/lib/users-repository";

export const runtime = "nodejs";

interface VerifyEmailPayload {
  token: string;
}

interface VerifyEmailParseResult {
  payload: VerifyEmailPayload | null;
  error: string | null;
}

function parseVerifyEmailPayload(payload: unknown): VerifyEmailParseResult {
  if (!payload || typeof payload !== "object") {
    return {
      payload: null,
      error: "Invalid request body. Provide the verification token.",
    };
  }

  const body = payload as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length < 20 || token.length > 400) {
    return {
      payload: null,
      error: "Verification token is invalid or malformed.",
    };
  }

  return {
    payload: { token },
    error: null,
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = parseVerifyEmailPayload(payload);
    if (!parsed.payload) {
      return NextResponse.json(
        { error: parsed.error || "Invalid verification payload." },
        { status: 400 },
      );
    }

    const tokenRecord = await consumeVerificationToken(parsed.payload.token);
    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Verification link is invalid or expired." },
        { status: 400 },
      );
    }

    const existingUser = await findUserById(tokenRecord.userId);
    if (
      !existingUser ||
      normalizeEmail(existingUser.email) !== normalizeEmail(tokenRecord.email)
    ) {
      return NextResponse.json(
        { error: "Verification link is invalid." },
        { status: 400 },
      );
    }

    const verifiedUser = existingUser.emailVerifiedAt
      ? existingUser
      : await markUserEmailVerified(tokenRecord.userId);

    if (!verifiedUser) {
      return NextResponse.json(
        { error: "Unable to verify account at this time." },
        { status: 500 },
      );
    }

    const metadata = getRequestMetadata(request);
    try {
      await createSessionForUser({
        userId: verifiedUser.id,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      });
      await touchUserLastLogin(verifiedUser.id);
    } catch (sessionError) {
      console.error(
        "Email verification succeeded but session initialization failed.",
        sessionError,
      );
    }

    return NextResponse.json({ verified: true, user: verifiedUser });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to verify email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
