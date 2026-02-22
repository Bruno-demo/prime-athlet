import { NextResponse } from "next/server";
import QRCode from "qrcode";

import { getAuthenticatedUser } from "@/lib/auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { resolveAdminAccessByEmailWithOverrides } from "@/lib/admin-access";
import {
  buildAdminOtpAuthUri,
  createAdminTwoFactorSetupToken,
  createBackupCodeSalt,
  encryptAdminTwoFactorSecret,
  generateBackupCodes,
  generateTotpBase32Secret,
  hashBackupCode,
  isAdminTwoFactorEncryptionConfigured,
  normalizeBackupCode,
  parseAdminTwoFactorSetupToken,
  resolveEffectiveAdminTotpSecret,
  verifyAdminTotp,
} from "@/lib/admin-two-factor";
import {
  hasAdminPermission,
} from "@/lib/admin-roles";
import {
  clearUserAdminTwoFactorState,
  consumeUserAdminBackupCode,
  findUserById,
  replaceUserAdminBackupCodes,
  setUserAdminTwoFactorState,
} from "@/lib/users-repository";

export const runtime = "nodejs";

type SetupAction = "begin" | "enable" | "regenerate-backup-codes" | "disable";

interface SetupPayload {
  action: SetupAction;
  setupToken?: string;
  verificationCode?: string;
}

function jsonNoStore(data: unknown, init?: Omit<ResponseInit, "headers">): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function parsePayload(payload: unknown): SetupPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const action =
    typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  if (
    action !== "begin" &&
    action !== "enable" &&
    action !== "regenerate-backup-codes" &&
    action !== "disable"
  ) {
    return null;
  }

  const setupToken =
    typeof body.setupToken === "string" ? body.setupToken.trim() : undefined;
  const verificationCode =
    typeof body.verificationCode === "string"
      ? body.verificationCode.trim()
      : undefined;

  return {
    action,
    setupToken,
    verificationCode,
  };
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

async function requireAdminIdentity() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      user: null,
      admin: null,
      response: jsonNoStore({ error: "Authentication required." }, { status: 401 }),
    };
  }

  if (!user.emailVerifiedAt) {
    return {
      user: null,
      admin: null,
      response: jsonNoStore(
        { error: "Verify your email before managing admin security." },
        { status: 403 },
      ),
    };
  }

  const admin = await resolveAdminAccessByEmailWithOverrides(user.email);
  if (!admin) {
    return {
      user: null,
      admin: null,
      response: jsonNoStore(
        { error: "Only admin users can access this security panel." },
        { status: 403 },
      ),
    };
  }

  if (!hasAdminPermission(admin.role, "admin:security:write")) {
    return {
      user: null,
      admin: null,
      response: jsonNoStore(
        { error: "Your admin role cannot manage security settings." },
        { status: 403 },
      ),
    };
  }

  return {
    user,
    admin,
    response: null,
  };
}

async function verifyAdminFactorForUser(params: {
  userId: string;
  environmentSecret: string | null;
  verificationCode: string;
}): Promise<boolean> {
  const userRecord = await findUserById(params.userId);
  if (!userRecord) {
    return false;
  }

  const effective = resolveEffectiveAdminTotpSecret({
    userAdminTwoFactor: userRecord.adminTwoFactor,
    environmentSecret: params.environmentSecret,
  });
  if (!effective.secret) {
    return false;
  }

  const rawCode = params.verificationCode.trim();
  if (/^\d{6,8}$/.test(rawCode) && verifyAdminTotp(effective.secret, rawCode)) {
    return true;
  }

  if (userRecord.adminTwoFactor?.backupCodeSalt) {
    const normalizedBackupCode = normalizeBackupCode(rawCode);
    if (normalizedBackupCode.length >= 8 && normalizedBackupCode.length <= 16) {
      const backupCodeHash = hashBackupCode(
        normalizedBackupCode,
        userRecord.adminTwoFactor.backupCodeSalt,
      );
      return consumeUserAdminBackupCode({
        userId: params.userId,
        backupCodeHash,
      });
    }
  }

  return false;
}

export async function GET() {
  try {
    const auth = await requireAdminIdentity();
    if (auth.response) {
      return auth.response;
    }

    const userRecord = await findUserById(auth.user.id);
    if (!userRecord) {
      return jsonNoStore({ error: "Admin account not found." }, { status: 404 });
    }

    const effective = resolveEffectiveAdminTotpSecret({
      userAdminTwoFactor: userRecord.adminTwoFactor,
      environmentSecret: auth.admin.twoFactorSecret,
    });

    return jsonNoStore({
      isAdmin: true,
      role: auth.admin.role,
      permissions: auth.admin.permissions,
      requiresTwoFactor: auth.admin.twoFactorRequired,
      configured: Boolean(effective.secret),
      source: effective.source,
      hasDatabaseConfig: effective.hasDatabaseConfig,
      encryptionConfigured: isAdminTwoFactorEncryptionConfigured(),
      backupCodesRemaining:
        userRecord.adminTwoFactor?.backupCodes.filter((code) => code.usedAt === null).length ??
        0,
      enabledAt: userRecord.adminTwoFactor
        ? userRecord.adminTwoFactor.enabledAt.toISOString()
        : null,
      updatedAt: userRecord.adminTwoFactor
        ? userRecord.adminTwoFactor.updatedAt.toISOString()
        : null,
      email: auth.user.email,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load admin two-factor configuration.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return jsonNoStore({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const auth = await requireAdminIdentity();
    if (auth.response) {
      return auth.response;
    }

    const payload = parsePayload(await request.json());
    if (!payload) {
      return jsonNoStore({ error: "Invalid security payload." }, { status: 400 });
    }

    if (payload.action === "begin") {
      if (!isAdminTwoFactorEncryptionConfigured()) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-security.2fa.begin",
          resourceType: "admin-security",
          status: "failure",
          message: "Missing ADMIN_2FA_ENCRYPTION_KEY.",
          request,
        });
        return jsonNoStore(
          {
            error:
              "Missing ADMIN_2FA_ENCRYPTION_KEY. Configure it before enabling admin 2FA.",
          },
          { status: 500 },
        );
      }

      const secret = generateTotpBase32Secret(32);
      const otpauthUri = buildAdminOtpAuthUri({
        email: auth.user.email,
        secret,
      });
      const setupToken = createAdminTwoFactorSetupToken({
        userId: auth.user.id,
        email: auth.user.email,
        secret,
      });
      const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 260,
      });

      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "admin-security.2fa.begin",
        resourceType: "admin-security",
        status: "success",
        message: "2FA setup session started.",
        request,
      });

      return jsonNoStore({
        setupToken,
        secret,
        otpauthUri,
        qrDataUrl,
        expiresInSeconds: 600,
      });
    }

    if (payload.action === "enable") {
      if (!payload.setupToken || !payload.verificationCode) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-security.2fa.enable",
          resourceType: "admin-security",
          status: "failure",
          message: "Setup token or verification code missing.",
          request,
        });
        return jsonNoStore(
          { error: "Setup token and verification code are required." },
          { status: 400 },
        );
      }

      const parsedToken = parseAdminTwoFactorSetupToken(payload.setupToken);
      if (!parsedToken) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-security.2fa.enable",
          resourceType: "admin-security",
          status: "failure",
          message: "2FA setup token expired or invalid.",
          request,
        });
        return jsonNoStore(
          { error: "Setup session expired. Start setup again." },
          { status: 400 },
        );
      }
      if (
        parsedToken.userId !== auth.user.id ||
        parsedToken.email !== auth.user.email.toLowerCase()
      ) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-security.2fa.enable",
          resourceType: "admin-security",
          status: "denied",
          message: "2FA setup token does not match authenticated admin.",
          request,
        });
        return jsonNoStore({ error: "Invalid setup session." }, { status: 403 });
      }

      if (!verifyAdminTotp(parsedToken.secret, payload.verificationCode.trim())) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-security.2fa.enable",
          resourceType: "admin-security",
          status: "failure",
          message: "Invalid authenticator verification code during setup.",
          request,
        });
        return jsonNoStore(
          { error: "Invalid verification code. Check your authenticator and retry." },
          { status: 400 },
        );
      }

      const backupCodes = generateBackupCodes(10);
      const backupCodeSalt = createBackupCodeSalt();
      const backupCodeHashes = backupCodes.map((code) =>
        hashBackupCode(code, backupCodeSalt),
      );
      const totpSecretCiphertext = encryptAdminTwoFactorSecret(parsedToken.secret);

      await setUserAdminTwoFactorState({
        userId: auth.user.id,
        totpSecretCiphertext,
        backupCodeSalt,
        backupCodeHashes,
      });

      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "admin-security.2fa.enable",
        resourceType: "admin-security",
        status: "success",
        message: "Admin 2FA enabled.",
        metadata: {
          backupCodesIssued: backupCodes.length,
        },
        request,
      });

      return jsonNoStore({
        success: true,
        backupCodes,
      });
    }

    if (payload.action === "regenerate-backup-codes") {
      if (!payload.verificationCode) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-security.2fa.regenerate-backup-codes",
          resourceType: "admin-security",
          status: "failure",
          message: "Missing verification code for backup code rotation.",
          request,
        });
        return jsonNoStore(
          { error: "Verification code is required." },
          { status: 400 },
        );
      }

      const verified = await verifyAdminFactorForUser({
        userId: auth.user.id,
        environmentSecret: auth.admin.twoFactorSecret,
        verificationCode: payload.verificationCode,
      });
      if (!verified) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-security.2fa.regenerate-backup-codes",
          resourceType: "admin-security",
          status: "failure",
          message: "Invalid authenticator or backup code for backup rotation.",
          request,
        });
        return jsonNoStore(
          { error: "Invalid authenticator or backup code." },
          { status: 400 },
        );
      }

      const backupCodes = generateBackupCodes(10);
      const backupCodeSalt = createBackupCodeSalt();
      const backupCodeHashes = backupCodes.map((code) =>
        hashBackupCode(code, backupCodeSalt),
      );
      await replaceUserAdminBackupCodes({
        userId: auth.user.id,
        backupCodeSalt,
        backupCodeHashes,
      });

      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "admin-security.2fa.regenerate-backup-codes",
        resourceType: "admin-security",
        status: "success",
        message: "Admin backup codes regenerated.",
        metadata: {
          backupCodesIssued: backupCodes.length,
        },
        request,
      });

      return jsonNoStore({
        success: true,
        backupCodes,
      });
    }

    if (payload.action === "disable") {
      if (!payload.verificationCode) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-security.2fa.disable",
          resourceType: "admin-security",
          status: "failure",
          message: "Missing verification code for 2FA disable.",
          request,
        });
        return jsonNoStore(
          { error: "Verification code is required." },
          { status: 400 },
        );
      }

      const verified = await verifyAdminFactorForUser({
        userId: auth.user.id,
        environmentSecret: auth.admin.twoFactorSecret,
        verificationCode: payload.verificationCode,
      });
      if (!verified) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-security.2fa.disable",
          resourceType: "admin-security",
          status: "failure",
          message: "Invalid authenticator or backup code for 2FA disable.",
          request,
        });
        return jsonNoStore(
          { error: "Invalid authenticator or backup code." },
          { status: 400 },
        );
      }

      await clearUserAdminTwoFactorState(auth.user.id);
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "admin-security.2fa.disable",
        resourceType: "admin-security",
        status: "success",
        message: "Admin 2FA disabled.",
        request,
      });
      return jsonNoStore({
        success: true,
      });
    }

    return jsonNoStore({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update admin two-factor configuration.";
    const authUser = await getAuthenticatedUser();
    await recordAdminAuditEvent({
      actorUserId: authUser?.id ?? null,
      actorEmail: authUser?.email ?? null,
      action: "admin-security.2fa.update",
      resourceType: "admin-security",
      status: "failure",
      message,
      request,
    });
    return jsonNoStore({ error: message }, { status: 500 });
  }
}
