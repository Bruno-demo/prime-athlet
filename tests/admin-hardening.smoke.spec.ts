import { APIRequestContext, APIResponse, expect, test } from "@playwright/test";
import { MongoClient } from "mongodb";

interface SmokeUser {
  email: string;
  displayName: string;
  password: string;
}

interface SignUpResponseBody {
  requiresVerification?: boolean;
  debugUrl?: string;
  error?: string;
}

interface GenericResponseBody {
  success?: boolean;
  error?: string;
  message?: string;
  debugUrl?: string;
}

interface TaxonomyListBody {
  sports?: Array<{ value: string }>;
  categories?: Array<{ value: string }>;
  error?: string;
}

interface AdminUsersBody {
  users?: Array<{
    email: string;
    adminRole: string | null;
    adminSource: "database" | "environment" | "none";
    adminDisabledByOverride: boolean;
  }>;
  error?: string;
}

const adminUser: SmokeUser = {
  email: process.env.PW_SMOKE_ADMIN_EMAIL || "pw-admin-fallback@sportiva.test",
  displayName: "Playwright Admin",
  password: process.env.PW_SMOKE_ADMIN_PASSWORD || "AdminSmokePass!123",
};

const targetUser: SmokeUser = {
  email: process.env.PW_SMOKE_TARGET_EMAIL || "pw-target-fallback@sportiva.test",
  displayName: "Playwright Target",
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
    data: {
      token,
    },
  });
  const body = await readJson<GenericResponseBody>(response);
  expect(
    response.ok(),
    `Email verification failed: status=${response.status()} body=${JSON.stringify(body)}`,
  ).toBeTruthy();
}

async function requestVerificationTokenForEmail(
  api: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await api.post("/api/auth/resend-verification", {
    data: {
      email,
    },
  });
  const body = await readJson<GenericResponseBody>(response);
  expect(
    response.ok(),
    `Resend verification failed: status=${response.status()} body=${JSON.stringify(body)}`,
  ).toBeTruthy();

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
    const body = await readJson<SignUpResponseBody>(signUpResponse);
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
      `Unexpected sign-up response for ${user.email}: status=${signUpResponse.status()} body=${JSON.stringify(
        body,
      )}`,
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

  const signInBody = await readJson<Record<string, unknown>>(signInResponse);
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
  const body = await readJson<Record<string, unknown>>(response);
  expect(
    response.ok(),
    `Sign-in failed for ${user.email}: status=${response.status()} body=${JSON.stringify(body)}`,
  ).toBeTruthy();
}

async function getAdminCsrfToken(api: APIRequestContext): Promise<string> {
  const csrfResponse = await api.get("/api/admin/csrf");
  const body = await readJson<{ token?: string; error?: string }>(csrfResponse);
  expect(
    csrfResponse.ok(),
    `Unable to fetch admin CSRF token: status=${csrfResponse.status()} body=${JSON.stringify(body)}`,
  ).toBeTruthy();
  expect(body.token, "Admin CSRF token is missing.").toBeTruthy();
  return body.token as string;
}

test.describe("Admin hardening smoke", () => {
  test.afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
      mongoClient = null;
    }
  });

  test.beforeAll(async ({ request }) => {
    const api = request;
    await ensureVerifiedUser(api, adminUser);
    await ensureVerifiedUser(api, targetUser);
  });

  test("taxonomy CRUD via admin API", async ({ request }) => {
    const api = request;
    const runId = Date.now().toString(36);
    const createdCategory = `Smoke Category ${runId}`;
    const createdSport = `Smoke Sport ${runId}`;
    const renamedSport = `Smoke Sport ${runId} Renamed`;

    try {
      await signInUser(api, adminUser);
      const csrfToken = await getAdminCsrfToken(api);

      const createSportResponse = await api.post("/api/admin/taxonomy", {
        headers: {
          "x-csrf-token": csrfToken,
        },
        data: {
          action: "create",
          type: "sport",
          value: createdSport,
        },
      });
      expect(createSportResponse.ok(), "Create sport failed.").toBeTruthy();

      const createCategoryResponse = await api.post("/api/admin/taxonomy", {
        headers: {
          "x-csrf-token": csrfToken,
        },
        data: {
          action: "create",
          type: "category",
          value: createdCategory,
        },
      });
      expect(createCategoryResponse.ok(), "Create category failed.").toBeTruthy();

      const renameSportResponse = await api.post("/api/admin/taxonomy", {
        headers: {
          "x-csrf-token": csrfToken,
        },
        data: {
          action: "rename",
          type: "sport",
          value: createdSport,
          nextValue: renamedSport,
        },
      });
      expect(renameSportResponse.ok(), "Rename sport failed.").toBeTruthy();

      const listResponse = await api.get("/api/admin/taxonomy");
      const listBody = await readJson<TaxonomyListBody>(listResponse);
      expect(
        listResponse.ok(),
        `List taxonomy failed: status=${listResponse.status()} body=${JSON.stringify(listBody)}`,
      ).toBeTruthy();

      expect(
        (listBody.sports || []).some((item) => item.value === renamedSport),
      ).toBeTruthy();
      expect(
        (listBody.categories || []).some((item) => item.value === createdCategory),
      ).toBeTruthy();
    } finally {
      await signInUser(api, adminUser);
      const cleanupCsrf = await getAdminCsrfToken(api);

      await api.post("/api/admin/taxonomy", {
        headers: {
          "x-csrf-token": cleanupCsrf,
        },
        data: {
          action: "delete",
          type: "category",
          value: createdCategory,
        },
      });
      await api.post("/api/admin/taxonomy", {
        headers: {
          "x-csrf-token": cleanupCsrf,
        },
        data: {
          action: "delete",
          type: "sport",
          value: renamedSport,
        },
      });
    }
  });

  test("admin role mutation stays controlled from user management only", async ({
    request,
  }) => {
    const api = request;

    await signInUser(api, adminUser);
    const csrfToken = await getAdminCsrfToken(api);

    const setRoleResponse = await api.post("/api/admin/users", {
      headers: {
        "x-csrf-token": csrfToken,
      },
      data: {
        action: "set-role",
        email: targetUser.email,
        role: "manager",
      },
    });
    const setRoleBody = await readJson<Record<string, unknown>>(setRoleResponse);
    expect(
      setRoleResponse.ok(),
      `Set admin role failed: status=${setRoleResponse.status()} body=${JSON.stringify(setRoleBody)}`,
    ).toBeTruthy();

    const usersAfterSetRoleResponse = await api.get(
      `/api/admin/users?q=${encodeURIComponent(targetUser.email)}&page=1&pageSize=20`,
    );
    const usersAfterSetRoleBody = await readJson<AdminUsersBody>(usersAfterSetRoleResponse);
    expect(usersAfterSetRoleResponse.ok()).toBeTruthy();
    const userAfterSetRole = (usersAfterSetRoleBody.users || []).find(
      (entry) => entry.email === targetUser.email,
    );
    expect(userAfterSetRole?.adminRole).toBe("manager");
    expect(userAfterSetRole?.adminSource).toBe("database");

    const revokeResponse = await api.post("/api/admin/users", {
      headers: {
        "x-csrf-token": csrfToken,
      },
      data: {
        action: "revoke-admin",
        email: targetUser.email,
      },
    });
    const revokeBody = await readJson<Record<string, unknown>>(revokeResponse);
    expect(
      revokeResponse.ok(),
      `Revoke admin failed: status=${revokeResponse.status()} body=${JSON.stringify(revokeBody)}`,
    ).toBeTruthy();

    const usersAfterRevokeResponse = await api.get(
      `/api/admin/users?q=${encodeURIComponent(targetUser.email)}&page=1&pageSize=20`,
    );
    const usersAfterRevokeBody = await readJson<AdminUsersBody>(usersAfterRevokeResponse);
    expect(usersAfterRevokeResponse.ok()).toBeTruthy();
    const userAfterRevoke = (usersAfterRevokeBody.users || []).find(
      (entry) => entry.email === targetUser.email,
    );
    expect(userAfterRevoke?.adminRole).toBeNull();
  });

  test("new product shortcut opens product editor and resets search state", async ({
    page,
  }) => {
    await signInUser(page.request, adminUser);

    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /analytics dashboard|control center/i }),
    ).toBeVisible();

    const searchInput = page.getByPlaceholder(
      "Search products by name, id, sport, category",
    );
    await searchInput.fill("running");

    await page.getByTestId("admin-new-product-button").click();

    await expect(page.getByRole("heading", { name: "Product Editor" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Product Library" })).toBeVisible();
    await expect(page.getByLabel("Product ID")).toHaveValue("");
    await expect(searchInput).toHaveValue("");
  });
});
