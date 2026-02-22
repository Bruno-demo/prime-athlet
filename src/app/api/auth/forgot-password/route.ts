import { NextResponse } from "next/server";

import { normalizeEmail, validateEmail } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/auth-email";
import { findUserByEmail } from "@/lib/users-repository";

export const runtime = "nodejs";

interface ForgotPasswordPayload {
  email: string;
}

interface ForgotPasswordParseResult {
  payload: ForgotPasswordPayload | null;
  error: string | null;
}

function parseForgotPasswordPayload(payload: unknown): ForgotPasswordParseResult {
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
  message: "If an account exists, a password reset email has been sent.",
};

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = parseForgotPasswordPayload(payload);
    if (!parsed.payload) {
      return NextResponse.json(
        { error: parsed.error || "Invalid forgot-password payload." },
        { status: 400 },
      );
    }

    const user = await findUserByEmail(parsed.payload.email);
    if (!user) {
      return NextResponse.json(genericResponse);
    }

    const delivery = await sendPasswordResetEmail({
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
        : "Unable to initiate password reset.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
