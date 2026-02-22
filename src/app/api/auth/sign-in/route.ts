import { NextResponse } from "next/server";

import {
  hashBackupCode,
  normalizeBackupCode,
  resolveEffectiveAdminTotpSecret,
  verifyAdminTotp,
} from "@/lib/admin-two-factor";
import {
  createSessionForUser,
  getRequestMetadata,
  normalizeEmail,
  validateEmail,
  verifyPassword,
} from "@/lib/auth";
import { resolveAdminAccessByEmailWithOverrides } from "@/lib/admin-access";
import {
  consumeUserAdminBackupCode,
  findUserByEmail,
  touchUserLastLogin,
} from "@/lib/users-repository";

export const runtime = "nodejs";

interface SignInPayload {
  email: string;
  password: string;
  otpCode: string | null;
}

interface SignInParseResult {
  payload: SignInPayload | null;
  error: string | null;
}

function parseSignInPayload(payload: unknown): SignInParseResult {
  if (!payload || typeof payload !== "object") {
    return {
      payload: null,
      error: "Invalid request body. Submit email and password.",
    };
  }

  const body = payload as Record<string, unknown>;
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const otpCode =
    typeof body.otpCode === "string"
      ? body.otpCode.trim()
      : "";

  if (!validateEmail(email)) {
    return {
      payload: null,
      error: "Invalid email address. Use a valid format like name@example.com.",
    };
  }

  if (password.length === 0) {
    return {
      payload: null,
      error: "Password is required.",
    };
  }

  if (
    otpCode.length > 0 &&
    (otpCode.length < 6 ||
      otpCode.length > 24 ||
      !/^[A-Za-z0-9\-\s]+$/.test(otpCode))
  ) {
    return {
      payload: null,
      error:
        "Invalid 2FA code format. Use 6-24 characters (letters, numbers, spaces, or hyphens).",
    };
  }

  return {
    payload: {
      email,
      password,
      otpCode: otpCode.length > 0 ? otpCode : null,
    },
    error: null,
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = parseSignInPayload(payload);
    if (!parsed.payload) {
      return NextResponse.json(
        { error: parsed.error || "Invalid sign-in payload." },
        { status: 400 },
      );
    }

    const user = await findUserByEmail(parsed.payload.email);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        {
          error: "Please verify your email before signing in.",
          needsVerification: true,
        },
        { status: 403 },
      );
    }

    const isPasswordValid = await verifyPassword(
      parsed.payload.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const adminAccess = await resolveAdminAccessByEmailWithOverrides(user.email);
    let adminMfaVerifiedAt: Date | null = null;

    if (adminAccess?.twoFactorRequired) {
      const effective = resolveEffectiveAdminTotpSecret({
        userAdminTwoFactor: user.adminTwoFactor,
        environmentSecret: adminAccess.twoFactorSecret,
      });
      if (effective.hasDatabaseConfig && !effective.secret) {
        return NextResponse.json(
          {
            error:
              "Admin 2FA is configured but encryption keys are missing or invalid on server.",
            requiresTwoFactor: true,
            setupRequired: true,
          },
          { status: 500 },
        );
      }

      if (!effective.secret) {
        return NextResponse.json(
          {
            error:
              "Admin sign-in requires 2FA setup. Open account security to configure authenticator.",
            requiresTwoFactor: true,
            setupRequired: true,
          },
          { status: 403 },
        );
      }

      if (!parsed.payload.otpCode) {
        return NextResponse.json(
          {
            error: "Enter your authenticator code or a backup code to continue admin sign-in.",
            requiresTwoFactor: true,
          },
          { status: 401 },
        );
      }

      const trimmedCode = parsed.payload.otpCode.trim();
      const isLikelyTotpCode = /^\d{6,8}$/.test(trimmedCode);
      let isValidFactor = false;

      if (isLikelyTotpCode) {
        isValidFactor = verifyAdminTotp(effective.secret, trimmedCode);
      }

      if (!isValidFactor && user.adminTwoFactor?.backupCodeSalt) {
        const normalizedBackupCode = normalizeBackupCode(trimmedCode);
        if (normalizedBackupCode.length >= 8 && normalizedBackupCode.length <= 16) {
          const backupCodeHash = hashBackupCode(
            normalizedBackupCode,
            user.adminTwoFactor.backupCodeSalt,
          );
          isValidFactor = await consumeUserAdminBackupCode({
            userId: user.id,
            backupCodeHash,
          });
        }
      }

      if (!isValidFactor) {
        return NextResponse.json(
          {
            error: "Invalid authenticator or backup code. Please try again.",
            requiresTwoFactor: true,
          },
          { status: 401 },
        );
      }

      adminMfaVerifiedAt = new Date();
    }

    const metadata = getRequestMetadata(request);
    await createSessionForUser({
      userId: user.id,
      adminMfaVerifiedAt,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    });
    await touchUserLastLogin(user.id);

    const safeUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      emailVerifiedAt: user.emailVerifiedAt,
      billingProfile: user.billingProfile,
      adminMfaVerifiedAt: adminMfaVerifiedAt
        ? adminMfaVerifiedAt.toISOString()
        : null,
    };
    return NextResponse.json({
      user: safeUser,
      adminRole: adminAccess?.role || null,
      requiresTwoFactor: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
