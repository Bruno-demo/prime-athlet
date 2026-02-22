import { APIRequestContext, APIResponse, Browser, expect, test } from "@playwright/test";
import { MongoClient } from "mongodb";

interface SmokeUser {
  email: string;
  displayName: string;
  password: string;
}

interface SignUpResponseBody {
  debugUrl?: string;
}

interface GenericResponseBody {
  debugUrl?: string;
}

interface CompareApiBody {
  authenticated?: boolean;
  productIds?: string[];
  products?: Array<{ id: string; name: string }>;
  count?: number;
  error?: string;
}

interface ProductDocument {
  id?: unknown;
  name?: unknown;
  stockQuantity?: unknown;
}

const compareUser: SmokeUser = {
  email: process.env.PW_SMOKE_TARGET_EMAIL || "pw-target-fallback@sportiva.test",
  displayName: "Playwright Compare User",
  password: process.env.PW_SMOKE_TARGET_PASSWORD || "ClientSmokePass!123",
};

let mongoClient: MongoClient | null = null;

async function readJson<T>(response: APIResponse): Promise<T> {
  return (await response.json()) as T;
}

async function getMongoClient(): Promise<MongoClient> {
  if (mongoClient) {
    return mongoClient;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required for smoke-test email verification fallback.");
  }

  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  return mongoClient;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createCompareSmokeProductId(): string {
  return `compare-smoke-${Date.now().toString(36)}`;
}

async function insertCompareSmokeProductInMongo(): Promise<{
  id: string;
  name: string;
}> {
  const mongoDbName = process.env.MONGODB_DB;
  if (!mongoDbName) {
    throw new Error("MONGODB_DB is unavailable for compare smoke product bootstrap.");
  }

  const client = await getMongoClient();
  const productsCollectionName = process.env.MONGODB_PRODUCTS_COLLECTION || "products";
  const id = createCompareSmokeProductId();
  const name = "Compare Smoke Product";

  await client
    .db(mongoDbName)
    .collection(productsCollectionName)
    .updateOne(
      { id },
      {
        $set: {
          id,
          name,
          sport: "Running",
          category: "Accessories",
          priceCents: 4900,
          rating: 4.2,
          reviews: 12,
          badge: "Smoke",
          description: "Auto-created compare smoke product for CI stability.",
          tone: "fitness",
          stockQuantity: 99,
          brand: "Prime Athlete",
          sku: `SMOKE-${id.toUpperCase()}`,
          tags: ["smoke", "compare", "ci"],
          sizes: ["One Size"],
          colors: ["Black"],
          images: [
            {
              src: "/products/photo-01.jpg",
              alt: "Compare smoke product image",
              width: 1600,
              height: 1600,
            },
          ],
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

  return { id, name };
}

async function getCompareSmokeProduct(): Promise<{ id: string; name: string | null }> {
  const mongoDbName = process.env.MONGODB_DB;
  if (!mongoDbName) {
    throw new Error("MONGODB_DB is unavailable for Mongo-backed compare smoke lookup.");
  }

  const client = await getMongoClient();
  const productsCollectionName = process.env.MONGODB_PRODUCTS_COLLECTION || "products";

  const candidate = (await client
    .db(mongoDbName)
    .collection<ProductDocument>(productsCollectionName)
    .findOne(
      { id: { $type: "string", $ne: "" } },
      {
        projection: {
          id: 1,
          name: 1,
          stockQuantity: 1,
        },
        sort: {
          stockQuantity: -1,
          id: 1,
        },
      },
    )) as ProductDocument | null;

  const productId = typeof candidate?.id === "string" ? candidate.id.trim() : "";
  if (!productId) {
    throw new Error("Unable to locate a product id for compare smoke test.");
  }

  const productName =
    typeof candidate?.name === "string" && candidate.name.trim().length > 0
      ? candidate.name.trim()
      : null;

  return {
    id: productId,
    name: productName,
  };
}

async function getCompareSmokeProductFromShop(
  api: APIRequestContext,
): Promise<{ id: string; name: string | null }> {
  const response = await api.get("/shop");
  expect(response.ok(), "Unable to load /shop for compare smoke fallback.").toBeTruthy();
  const html = await response.text();

  const idMatches = Array.from(
    html.matchAll(/href=["']\/shop\/([^"'?#/]+)["']/g),
  );
  const uniqueIds = Array.from(
    new Set(
      idMatches
        .map((match) => {
          try {
            return decodeURIComponent((match[1] || "").trim());
          } catch {
            return (match[1] || "").trim();
          }
        })
        .filter((value) => value.length >= 2),
    ),
  );

  const productId = uniqueIds[0];
  if (!productId) {
    throw new Error("Unable to derive a compare product id from /shop page.");
  }

  return {
    id: productId,
    name: null,
  };
}

async function resolveCompareSmokeProduct(
  api: APIRequestContext,
): Promise<{ id: string; name: string | null }> {
  try {
    return await getCompareSmokeProduct();
  } catch {
    try {
      return await getCompareSmokeProductFromShop(api);
    } catch {
      return insertCompareSmokeProductInMongo();
    }
  }
}

async function markUserVerifiedInMongo(email: string): Promise<void> {
  const mongoDbName = process.env.MONGODB_DB;
  if (!mongoDbName) {
    throw new Error("MONGODB_DB is required for smoke-test email verification fallback.");
  }

  const client = await getMongoClient();
  const usersCollectionName = process.env.MONGODB_USERS_COLLECTION || "users";
  const now = new Date();
  const result = await client
    .db(mongoDbName)
    .collection(usersCollectionName)
    .updateOne(
      { email: email.trim().toLowerCase() },
      { $set: { emailVerifiedAt: now, updatedAt: now } },
    );

  if (!result.matchedCount) {
    throw new Error(`Unable to locate user ${email} for fallback verification.`);
  }
}

function extractTokenFromDebugUrl(debugUrl: unknown): string | null {
  if (typeof debugUrl !== "string" || debugUrl.length === 0) {
    return null;
  }

  try {
    const parsedUrl = new URL(debugUrl);
    const token = parsedUrl.searchParams.get("token");
    return token && token.length > 10 ? token : null;
  } catch {
    return null;
  }
}

async function verifyToken(api: APIRequestContext, token: string): Promise<void> {
  const response = await api.post("/api/auth/verify-email", {
    data: { token },
  });
  expect(response.ok()).toBeTruthy();
}

async function requestVerificationTokenForEmail(
  api: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await api.post("/api/auth/resend-verification", {
    data: { email },
  });
  const body = await readJson<GenericResponseBody>(response);
  expect(response.ok()).toBeTruthy();

  const token = extractTokenFromDebugUrl(body.debugUrl);
  if (!token) {
    throw new Error("Verification debug URL token is missing.");
  }
  return token;
}

async function ensureVerifiedUser(
  api: APIRequestContext,
  user: SmokeUser,
): Promise<void> {
  let signUpResponse: APIResponse | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    signUpResponse = await api.post("/api/auth/sign-up", {
      data: {
        email: user.email,
        displayName: user.displayName,
        password: user.password,
      },
    });

    if (
      signUpResponse.status() !== 500 &&
      signUpResponse.status() !== 502 &&
      signUpResponse.status() !== 503 &&
      signUpResponse.status() !== 504
    ) {
      break;
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
  }

  if (!signUpResponse) {
    throw new Error(`Unable to sign up or verify user ${user.email}.`);
  }

  if (signUpResponse.status() === 200) {
    const body = await readJson<SignUpResponseBody>(signUpResponse);
    const signUpToken = extractTokenFromDebugUrl(body.debugUrl);
    if (signUpToken) {
      await verifyToken(api, signUpToken);
      return;
    }

    try {
      const resendToken = await requestVerificationTokenForEmail(api, user.email);
      await verifyToken(api, resendToken);
    } catch {
      await markUserVerifiedInMongo(user.email);
    }
    return;
  }

  if (signUpResponse.status() !== 409) {
    const body = await signUpResponse.text();
    const signInFallback = await api.post("/api/auth/sign-in", {
      data: {
        email: user.email,
        password: user.password,
      },
    });
    if (signInFallback.ok()) {
      return;
    }
    throw new Error(
      `Unexpected sign-up response for ${user.email}: status=${signUpResponse.status()} body=${body}`,
    );
  }

  const signInResponse = await api.post("/api/auth/sign-in", {
    data: {
      email: user.email,
      password: user.password,
    },
  });

  if (signInResponse.ok()) {
    return;
  }

  const signInBody = await signInResponse.json();
  const needsVerification =
    signInResponse.status() === 403 &&
    Boolean(signInBody && (signInBody as { needsVerification?: boolean }).needsVerification);
  if (!needsVerification) {
    throw new Error(
      `Unable to sign in existing user ${user.email}: status=${signInResponse.status()} body=${JSON.stringify(
        signInBody,
      )}`,
    );
  }

  try {
    const token = await requestVerificationTokenForEmail(api, user.email);
    await verifyToken(api, token);
  } catch {
    await markUserVerifiedInMongo(user.email);
  }
}

async function signInUser(api: APIRequestContext, user: SmokeUser): Promise<void> {
  const response = await api.post("/api/auth/sign-in", {
    data: {
      email: user.email,
      password: user.password,
    },
  });
  const body = await response.json();
  expect(
    response.ok(),
    `Sign-in failed for ${user.email}: status=${response.status()} body=${JSON.stringify(body)}`,
  ).toBeTruthy();
}

async function clearCompare(api: APIRequestContext): Promise<void> {
  const response = await api.put("/api/account/compare", {
    data: { productIds: [] },
  });
  const body = await response.json();
  expect(
    response.ok(),
    `Unable to clear compare list: status=${response.status()} body=${JSON.stringify(body)}`,
  ).toBeTruthy();
}

async function createSignedInDevice(
  browser: Browser,
): Promise<{ context: Awaited<ReturnType<Browser["newContext"]>> }> {
  const baseURL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3210";
  const context = await browser.newContext({ baseURL });
  await signInUser(context.request, compareUser);
  return { context };
}

test.describe("Compare sync smoke", () => {
  test.afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
      mongoClient = null;
    }
  });

  test.beforeAll(async ({ request }) => {
    await ensureVerifiedUser(request, compareUser);
  });

  test("compare list syncs across separate signed-in sessions", async ({
    browser,
    request,
  }) => {
    test.slow();
    const smokeProduct = await resolveCompareSmokeProduct(request);
    const productId = smokeProduct.id;

    await signInUser(request, compareUser);
    await clearCompare(request);

    const deviceA = await createSignedInDevice(browser);
    const deviceB = await createSignedInDevice(browser);

    try {
      const addResponse = await deviceA.context.request.post("/api/account/compare", {
        data: { productId },
      });
      const addBody = await readJson<CompareApiBody>(addResponse);
      expect(
        addResponse.ok(),
        `Unable to add compare item: status=${addResponse.status()} body=${JSON.stringify(addBody)}`,
      ).toBeTruthy();

      await expect
        .poll(async () => {
          const response = await deviceA.context.request.get("/api/account/compare");
          const body = (await readJson<CompareApiBody>(response)) || {};
          return (
            response.ok() &&
            body.authenticated === true &&
            Array.isArray(body.productIds) &&
            body.productIds.includes(productId)
          );
        })
        .toBeTruthy();

      await expect
        .poll(async () => {
          const response = await deviceB.context.request.get("/api/account/compare");
          const body = (await readJson<CompareApiBody>(response)) || {};
          if (
            response.ok() &&
            body.authenticated === true &&
            Array.isArray(body.productIds) &&
            body.productIds.includes(productId)
          ) {
            return true;
          }
          return false;
        })
        .toBeTruthy();

      const pageB = await deviceB.context.newPage();
      await pageB.goto("/compare");
      await expect(pageB.getByRole("heading", { name: /compare products/i })).toBeVisible();
      const verifyResponse = await deviceB.context.request.get("/api/account/compare");
      const verifyBody = ((await readJson<CompareApiBody>(verifyResponse)) || {}) as CompareApiBody;
      const expectedName = (verifyBody.products ?? []).find(
        (product: { id: string; name: string }) => product.id === productId,
      )?.name || smokeProduct.name;
      if (expectedName) {
        await expect(
          pageB.getByText(new RegExp(escapeRegExp(expectedName), "i")).first(),
        ).toBeVisible();
      } else {
        await expect(pageB.getByText(new RegExp(escapeRegExp(productId), "i")).first()).toBeVisible();
      }
    } finally {
      await signInUser(request, compareUser);
      await clearCompare(request);
      await deviceA.context.close();
      await deviceB.context.close();
    }
  });
});
