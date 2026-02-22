import { NextResponse } from "next/server";

import { normalizeEmail, validateEmail } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/auth-email";
import { findUserByEmail } from "@/lib/users-repository";

export const runtime = "nodejs";

interface ResendPayload {
  email: string;
}

interface ResendParseResult {
  payload: ResendPayload | null;
  error: string | null;
}

function parseResendPayload(payload: unknown): ResendParseResult {
  if (!payload || typeof payload !== "object") {
    return {
      payload: null,
      error: "Invalid request body. Provide the account email.",
    };
  }

  const body = payload as Record<string, unknown>;
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!validateEmail(email)) {
    return {
      payload: null,
      error: "Invalid email address. Use a valid format like name@example.com.",
    };
  }

  return {
    payload: { email },
    error: null,
  };
}

const genericResponse = {
  success: true,
  message: "If an account exists, a verification email has been sent.",
};

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = parseResendPayload(payload);
    if (!parsed.payload) {
      return NextResponse.json(
        { error: parsed.error || "Invalid verification resend payload." },
        { status: 400 },
      );
    }

    const user = await findUserByEmail(parsed.payload.email);
    if (!user || user.emailVerifiedAt) {
      return NextResponse.json(genericResponse);
    }

    const delivery = await sendVerificationEmail({
      request,
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    return NextResponse.json({
      ...genericResponse,
      debugUrl: delivery.debugUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to resend verification email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
