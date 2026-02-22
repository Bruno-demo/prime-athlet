import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface MediaStorageResult {
  src: string;
  storage: "local" | "s3";
  key: string;
}

interface S3Config {
  bucket: string;
  region: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
}

declare global {
  var _sportivaS3Client: S3Client | undefined;
}

function toBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeBaseUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

function getS3Config(): S3Config | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim() || null;
  const publicBaseUrl = normalizeBaseUrl(
    process.env.S3_PUBLIC_BASE_URL || null,
  );

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    bucket,
    region,
    endpoint,
    forcePathStyle: toBoolean(process.env.S3_FORCE_PATH_STYLE, false),
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}

function getS3Client(config: S3Config): S3Client {
  if (!global._sportivaS3Client) {
    global._sportivaS3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return global._sportivaS3Client;
}

function buildDefaultPublicUrl(config: S3Config, key: string): string {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${key}`;
  }

  if (config.endpoint) {
    return `${config.endpoint.replace(/\/+$/, "")}/${config.bucket}/${key}`;
  }

  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

export function isS3MediaStorageEnabled(): boolean {
  return getS3Config() !== null;
}

export async function storeMediaInObjectStorage(params: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<MediaStorageResult | null> {
  const config = getS3Config();
  if (!config) {
    return null;
  }

  const client = getS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl:
        params.cacheControl || "public, max-age=31536000, immutable",
    }),
  );

  return {
    src: buildDefaultPublicUrl(config, params.key),
    storage: "s3",
    key: params.key,
  };
}
