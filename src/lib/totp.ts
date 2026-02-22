import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(secret: string): Buffer | null {
  const normalized = secret
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/=+$/g, "");

  if (normalized.length === 0) {
    return null;
  }

  let bits = "";
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) {
      return null;
    }
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    const byte = bits.slice(offset, offset + 8);
    bytes.push(parseInt(byte, 2));
  }

  return Buffer.from(bytes);
}

function normalizeCode(code: string): string {
  return code.replace(/\D/g, "");
}

function generateTotpCode(params: {
  secret: Buffer;
  counter: number;
  digits: number;
}): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(params.counter));

  const hmac = createHmac("sha1", params.secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = binaryCode % 10 ** params.digits;
  return String(code).padStart(params.digits, "0");
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyTotpCode(params: {
  secret: string;
  code: string;
  timestampMs?: number;
  periodSeconds?: number;
  window?: number;
  digits?: number;
}): boolean {
  const decodedSecret = decodeBase32(params.secret);
  if (!decodedSecret || decodedSecret.length === 0) {
    return false;
  }

  const digits = Math.min(Math.max(params.digits ?? 6, 6), 8);
  const normalizedCode = normalizeCode(params.code);
  if (normalizedCode.length !== digits) {
    return false;
  }

  const timestampMs = params.timestampMs ?? Date.now();
  const periodSeconds = Math.min(Math.max(params.periodSeconds ?? 30, 15), 120);
  const window = Math.min(Math.max(params.window ?? 1, 0), 3);

  const counter = Math.floor(timestampMs / 1000 / periodSeconds);

  for (let offset = -window; offset <= window; offset += 1) {
    const candidateCounter = counter + offset;
    if (candidateCounter < 0) {
      continue;
    }

    const expectedCode = generateTotpCode({
      secret: decodedSecret,
      counter: candidateCounter,
      digits,
    });
    if (safeEquals(expectedCode, normalizedCode)) {
      return true;
    }
  }

  return false;
}
