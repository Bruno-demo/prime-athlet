import { Db, MongoClient } from "mongodb";

const mongoUri = process.env.MONGODB_URI?.trim();
const mongoDbName = process.env.MONGODB_DB?.trim();

function parsePositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseMongoAddressFamily(): 4 | 6 | undefined {
  const raw = process.env.MONGODB_ADDRESS_FAMILY?.trim();
  if (raw === "4") {
    return 4;
  }
  if (raw === "6") {
    return 6;
  }
  return undefined;
}

const mongoServerSelectionTimeoutMs = parsePositiveIntEnv(
  "MONGODB_SERVER_SELECTION_TIMEOUT_MS",
  90_000,
);
const mongoConnectTimeoutMs = parsePositiveIntEnv(
  "MONGODB_CONNECT_TIMEOUT_MS",
  60_000,
);
const mongoSocketTimeoutMs = parsePositiveIntEnv(
  "MONGODB_SOCKET_TIMEOUT_MS",
  120_000,
);
const mongoMaxPoolSize = parsePositiveIntEnv("MONGODB_MAX_POOL_SIZE", 25);
const mongoMinPoolSize = parsePositiveIntEnv("MONGODB_MIN_POOL_SIZE", 0);
const mongoAddressFamily = parseMongoAddressFamily();
const mongoConnectRetries = parsePositiveIntEnv("MONGODB_CONNECT_RETRIES", 1);
const mongoConnectRetryDelayMs = parsePositiveIntEnv(
  "MONGODB_CONNECT_RETRY_DELAY_MS",
  800,
);

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function isMongoConfigured(): boolean {
  return Boolean(mongoUri && mongoDbName);
}

function isRetryableMongoConnectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();

  if (name.includes("networktimeout") || name.includes("networkerror")) {
    return true;
  }

  return (
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("enetunreach") ||
    message.includes("ehostunreach")
  );
}

function createMongoClient(uri: string): MongoClient {
  return new MongoClient(uri, {
    serverSelectionTimeoutMS: mongoServerSelectionTimeoutMs,
    connectTimeoutMS: mongoConnectTimeoutMs,
    socketTimeoutMS: mongoSocketTimeoutMs,
    maxPoolSize: mongoMaxPoolSize,
    minPoolSize: mongoMinPoolSize,
    retryReads: true,
    retryWrites: true,
    family: mongoAddressFamily,
  });
}

async function connectMongoClientWithRetry(uri: string): Promise<MongoClient> {
  const maxAttempts = Math.max(1, mongoConnectRetries + 1);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = createMongoClient(uri);
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.close().catch(() => undefined);

      const canRetry =
        attempt < maxAttempts && isRetryableMongoConnectError(error);
      if (!canRetry) {
        throw error;
      }

      console.warn(
        `[mongodb] Connect attempt ${attempt}/${maxAttempts} failed (${error instanceof Error ? error.message : "unknown error"}). Retrying...`,
      );
      await sleep(mongoConnectRetryDelayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to connect to MongoDB.");
}

async function getMongoClient(): Promise<MongoClient> {
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI.");
  }

  if (!global._mongoClientPromise) {
    global._mongoClientPromise = connectMongoClientWithRetry(mongoUri).catch(
      (error) => {
        global._mongoClientPromise = undefined;
        throw error;
      },
    );
  }

  return global._mongoClientPromise;
}

export async function getMongoDatabase(): Promise<Db> {
  if (!mongoDbName) {
    throw new Error("Missing MONGODB_DB.");
  }

  const client = await getMongoClient();
  return client.db(mongoDbName);
}
