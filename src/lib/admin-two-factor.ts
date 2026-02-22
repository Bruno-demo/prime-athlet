import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "crypto";

import { verifyTotpCode } from "@/lib/totp";
import { UserAdminTwoFactorState } from "@/lib/users-repository";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SETUP_TOKEN_TTL_SECONDS = 10 * 60;

type SetupTokenPayload = {
  v: 1;
  userId: string;
  email: string;
  secret: string;
  expiresAt: number;
};

export function normalizeTotpSecret(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
}

function getEncryptionKey(): Buffer | null {
  const raw =
    process.env.ADMIN_2FA_ENCRYPTION_KEY ||
    process.env.ADMIN_2FA_SETUP_TOKEN_SECRET ||
    "";
  if (!raw || raw.trim().length < 16) {
    return null;
  }

  return createHash("sha256").update(raw.trim()).digest();
}

function getSetupTokenKey(): Buffer | null {
  return getEncryptionKey();
}

function base64urlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function base64urlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function toBase32(value: Buffer): string {
  let bits = "";
  for (const byte of value) {
    bits += byte.toString(2).padStart(8, "0");
  }

  let output = "";
  for (let offset = 0; offset < bits.length; offset += 5) {
    const chunk = bits.slice(offset, offset + 5);
    if (chunk.length < 5) {
      output += BASE32_ALPHABET[parseInt(chunk.padEnd(5, "0"), 2)];
    } else {
      output += BASE32_ALPHABET[parseInt(chunk, 2)];
    }
  }

  return output;
}

function signSetupToken(payloadEncoded: string): string {
  const key = getSetupTokenKey();
  if (!key) {
    throw new Error(
      "Missing ADMIN_2FA_ENCRYPTION_KEY for 2FA setup token signing.",
    );
  }

  return createHmac("sha256", key).update(payloadEncoded).digest("base64url");
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${base64urlEncode(iv)}.${base64urlEncode(tag)}.${base64urlEncode(encrypted)}`;
}

function decryptWithKey(ciphertext: string, key: Buffer): string | null {
  const [ivEncoded, tagEncoded, encryptedEncoded] = ciphertext.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    return null;
  }

  try {
    const iv = base64urlDecode(ivEncoded);
    const tag = base64urlDecode(tagEncoded);
    const encrypted = base64urlDecode(encryptedEncoded);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function isAdminTwoFactorEncryptionConfigured(): boolean {
  return getEncryptionKey() !== null;
}

export function encryptAdminTwoFactorSecret(secret: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      "Missing ADMIN_2FA_ENCRYPTION_KEY. Set it before enabling 2FA.",
    );
  }

  return encryptWithKey(normalizeTotpSecret(secret), key);
}

export function decryptAdminTwoFactorSecret(ciphertext: string): string | null {
  const key = getEncryptionKey();
  if (!key) {
    return null;
  }

  const decrypted = decryptWithKey(ciphertext, key);
  if (!decrypted) {
    return null;
  }

  const normalized = normalizeTotpSecret(decrypted);
  return normalized.length >= 16 ? normalized : null;
}

export function generateTotpBase32Secret(length = 32): string {
  const minLength = Math.min(Math.max(Math.floor(length), 16), 64);
  const random = randomBytes(Math.ceil((minLength * 5) / 8) + 2);
  const base32 = toBase32(random);
  return base32.slice(0, minLength);
}

export function buildAdminOtpAuthUri(params: {
  email: string;
  secret: string;
  issuer?: string;
}): string {
  const issuer =
    (params.issuer || "Prime Athlete Admin").trim() || "Prime Athlete Admin";
  const accountName = params.email.trim().toLowerCase();
  const label = `${issuer}:${accountName}`;

  const search = new URLSearchParams({
    secret: normalizeTotpSecret(params.secret),
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${search.toString()}`;
}

export function createAdminTwoFactorSetupToken(params: {
  userId: string;
  email: string;
  secret: string;
}): string {
  const payload: SetupTokenPayload = {
    v: 1,
    userId: params.userId,
    email: params.email.trim().toLowerCase(),
    secret: normalizeTotpSecret(params.secret),
    expiresAt: Date.now() + SETUP_TOKEN_TTL_SECONDS * 1000,
  };

  const payloadEncoded = base64urlEncode(JSON.stringify(payload));
  const signature = signSetupToken(payloadEncoded);

  return `${payloadEncoded}.${signature}`;
}

export function parseAdminTwoFactorSetupToken(
  token: string,
): SetupTokenPayload | null {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    return null;
  }

  try {
    const expectedSignature = signSetupToken(payloadEncoded);
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !expectedBuffer.equals(providedBuffer)
    ) {
      return null;
    }

    const payload = JSON.parse(
      base64urlDecode(payloadEncoded).toString("utf8"),
    ) as SetupTokenPayload;
    if (
      payload.v !== 1 ||
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.secret !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }

    if (payload.expiresAt < Date.now()) {
      return null;
    }

    const normalizedSecret = normalizeTotpSecret(payload.secret);
    if (normalizedSecret.length < 16) {
      return null;
    }

    return {
      ...payload,
      secret: normalizedSecret,
      email: payload.email.trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function normalizeBackupCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateBackupCodes(count = 10): string[] {
  const safeCount = Math.min(Math.max(Math.floor(count), 4), 20);
  const codes: string[] = [];

  for (let index = 0; index < safeCount; index += 1) {
    let value = "";
    while (value.length < 8) {
      const byte = randomBytes(1)[0] % BACKUP_CODE_ALPHABET.length;
      value += BACKUP_CODE_ALPHABET[byte];
    }
    codes.push(`${value.slice(0, 4)}-${value.slice(4)}`);
  }

  return codes;
}

export function createBackupCodeSalt(): string {
  return randomBytes(16).toString("base64url");
}

export function hashBackupCode(code: string, salt: string): string {
  const normalized = normalizeBackupCode(code);
  return createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
}

export function verifyAdminTotp(secret: string, code: string): boolean {
  return verifyTotpCode({
    secret: normalizeTotpSecret(secret),
    code,
  });
}

export function resolveEffectiveAdminTotpSecret(params: {
  userAdminTwoFactor: UserAdminTwoFactorState | null | undefined;
  environmentSecret: string | null;
}): {
  secret: string | null;
  source: "database" | "environment" | "none";
  hasDatabaseConfig: boolean;
} {
  const dbSecretCiphertext =
    params.userAdminTwoFactor?.totpSecretCiphertext || null;
  if (dbSecretCiphertext) {
    const decrypted = decryptAdminTwoFactorSecret(dbSecretCiphertext);
    if (decrypted) {
      return {
        secret: decrypted,
        source: "database",
        hasDatabaseConfig: true,
      };
    }
  }

  const envSecret = normalizeTotpSecret(params.environmentSecret || "");
  if (envSecret.length >= 16) {
    return {
      secret: envSecret,
      source: "environment",
      hasDatabaseConfig: Boolean(dbSecretCiphertext),
    };
  }

  return {
    secret: null,
    source: "none",
    hasDatabaseConfig: Boolean(dbSecretCiphertext),
  };
}
