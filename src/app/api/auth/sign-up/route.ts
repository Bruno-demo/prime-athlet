import { NextResponse } from "next/server";

import {
  hashPassword,
  normalizeEmail,
  validateEmail,
  validatePasswordStrength,
} from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/auth-email";
import {
  createUser,
  findUserByEmail,
  isDuplicateEmailError,
} from "@/lib/users-repository";

export const runtime = "nodejs";

interface SignUpPayload {
  email: string;
  displayName: string;
  password: string;
}

interface SignUpParseResult {
  payload: SignUpPayload | null;
  error: string | null;
}

function parseSignUpPayload(payload: unknown): SignUpParseResult {
  if (!payload || typeof payload !== "object") {
    return {
      payload: null,
      error: "Invalid request body. Submit email, full name, and password.",
    };
  }

  const body = payload as Record<string, unknown>;
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!validateEmail(email)) {
    return {
      payload: null,
      error: "Invalid email address. Use a valid format like name@example.com.",
    };
  }

  if (displayName.length < 2 || displayName.length > 60) {
    return {
      payload: null,
      error: "Invalid full name. Name must be between 2 and 60 characters.",
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
    payload: {
      email,
      displayName,
      password,
    },
    error: null,
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = parseSignUpPayload(payload);
    if (!parsed.payload) {
      return NextResponse.json(
        { error: parsed.error || "Invalid sign-up payload." },
        { status: 400 },
      );
    }

    const existingUser = await findUserByEmail(parsed.payload.email);
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(parsed.payload.password);
    const user = await createUser({
      email: parsed.payload.email,
      displayName: parsed.payload.displayName,
      passwordHash,
    });

    const delivery = await sendVerificationEmail({
      request,
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    return NextResponse.json({
      requiresVerification: true,
      email: user.email,
      debugUrl: delivery.debugUrl,
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const message = error instanceof Error ? error.message : "Unable to sign up.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
