import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.VIEWPORT_QA_AUTH_PORT || "3223");
const BASE_URL = `http://localhost:${PORT}`;
const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "test-results", "viewport-qa-auth");
const RUN_ID = Date.now().toString(36);

const accountUser = {
  email:
    process.env.VIEWPORT_QA_ACCOUNT_EMAIL ||
    (process.env.CI
      ? `qa-account-${RUN_ID}@sportiva.test`
      : "qa-account-viewport@sportiva.test"),
  password: process.env.VIEWPORT_QA_ACCOUNT_PASSWORD || "AccountQaPass!123",
  displayName: "QA Account User",
};

const adminUser = {
  email:
    process.env.VIEWPORT_QA_ADMIN_EMAIL ||
    (process.env.CI
      ? `qa-admin-${RUN_ID}@sportiva.test`
      : "qa-admin-viewport@sportiva.test"),
  password: process.env.VIEWPORT_QA_ADMIN_PASSWORD || "AdminQaPass!123",
  displayName: "QA Admin User",
};

const accountPages = [
  { id: "account-home", url: "/account" },
  { id: "account-billing", url: "/account/billing" },
];

const adminPanels = [
  { id: "admin-overview", navLabel: null },
  { id: "admin-product", navLabel: "Product" },
  { id: "admin-media", navLabel: "Media" },
  { id: "admin-promotions", navLabel: "Promotions" },
  { id: "admin-reports", navLabel: "Reports" },
  { id: "admin-settings", navLabel: "Settings" },
];

const viewports = [
  { width: 320, height: 900 },
  { width: 360, height: 900 },
  { width: 390, height: 900 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
];

async function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status >= 300) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for dev server at ${url}.`);
}

function startDevServer() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    NEXT_PUBLIC_APP_URL: BASE_URL,
    NEXT_DIST_DIR: ".next-viewport-qa-auth",
    ADMIN_ROLE_ASSIGNMENTS: `${adminUser.email}:owner`,
    ADMIN_EMAILS: "",
    ADMIN_REQUIRE_2FA: "false",
    ADMIN_2FA_SECRETS: "",
    EXPOSE_AUTH_DEBUG_LINKS: "true",
    EMAIL_FROM: "",
    SMTP_HOST: "",
    SMTP_PORT: "",
    SMTP_SECURE: "false",
    SMTP_USER: "",
    SMTP_PASS: "",
  };

  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", `npm run dev -- --port ${PORT}`], {
          cwd: ROOT,
          stdio: "pipe",
          env,
        })
      : spawn("npm", ["run", "dev", "--", "--port", String(PORT)], {
          cwd: ROOT,
          stdio: "pipe",
          env,
        });

  child.stdout.on("data", () => {
    // Drain stdout.
  });
  child.stderr.on("data", (chunk) => {
    const text = String(chunk || "");
    if (text.trim().length > 0) {
      process.stderr.write(text);
    }
  });

  return child;
}

async function stopDevServer(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        shell: true,
        stdio: "ignore",
      });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  child.kill("SIGTERM");
}

async function createAndVerifyUser(user) {
  let signUpResponse = null;
  let signUpBody = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    signUpResponse = await fetch(`${BASE_URL}/api/auth/sign-up`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        displayName: user.displayName,
        password: user.password,
      }),
    });
    signUpBody = await signUpResponse.json().catch(() => null);
    if (signUpResponse.ok && signUpBody?.requiresVerification) {
      break;
    }

    if (signUpResponse.status === 409) {
      return;
    }

    const shouldRetry =
      signUpResponse.status === 500 ||
      signUpResponse.status === 404 ||
      signUpResponse.status === 502 ||
      signUpResponse.status === 503 ||
      signUpResponse.status === 504;
    if (!shouldRetry || attempt === 6) {
      break;
    }
    await delay(1200);
  }

  if (!signUpResponse?.ok || !signUpBody?.requiresVerification) {
    const signInProbe = await fetch(`${BASE_URL}/api/auth/sign-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });
    if (signInProbe.ok) {
      return;
    }

    throw new Error(
      `Sign-up failed for ${user.email}: ${
        signUpBody?.error || `HTTP ${signUpResponse?.status ?? "unknown"}`
      }`,
    );
  }

  const debugUrl =
    typeof signUpBody.debugUrl === "string" ? signUpBody.debugUrl : null;
  if (!debugUrl) {
    throw new Error(`No debug verification URL returned for ${user.email}.`);
  }

  const token = new URL(debugUrl).searchParams.get("token");
  if (!token) {
    throw new Error(`Invalid debug verification URL for ${user.email}.`);
  }

  const verifyResponse = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
  const verifyBody = await verifyResponse.json().catch(() => null);
  if (!verifyResponse.ok || !verifyBody?.verified) {
    throw new Error(
      `Email verification failed for ${user.email}: ${
        verifyBody?.error || `HTTP ${verifyResponse.status}`
      }`,
    );
  }
}

async function signInWithUi(context, user, nextPath) {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/auth/sign-in?next=${encodeURIComponent(nextPath)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);

    await Promise.all([
      page.waitForURL((url) => url.pathname === nextPath, { timeout: 30_000 }),
      page.getByRole("button", { name: /sign in securely/i }).click(),
    ]);

    await page.waitForTimeout(900);
  } finally {
    await page.close();
  }
}

async function capturePageSnapshot({
  page,
  role,
  id,
  url,
  viewport,
  afterLoad,
}) {
  const consoleErrors = [];
  const listener = (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  };
  page.on("console", listener);

  const response = await page.goto(`${BASE_URL}${url}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });

  if (afterLoad) {
    await afterLoad(page);
  }

  await page.waitForTimeout(1300);

  const screenshotName = `${role}-${id}-${viewport.width}.png`;
  await page.screenshot({
    path: path.join(OUTPUT_DIR, screenshotName),
    fullPage: true,
  });

  const metrics = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);

    const offenders = [];
    const nodes = Array.from(document.querySelectorAll("body *"));
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        continue;
      }
      if (rect.right > viewportWidth + 1 || rect.left < -1) {
        offenders.push({
          tag: node.tagName.toLowerCase(),
          className: node.className || "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
      if (offenders.length >= 8) {
        break;
      }
    }

    return {
      viewportWidth,
      scrollWidth,
      horizontalOverflow: scrollWidth - viewportWidth,
      overflowOffenders: offenders,
      documentHeight: root.scrollHeight,
    };
  });

  page.off("console", listener);

  return {
    role,
    page: url,
    pageId: id,
    viewport,
    status: response?.status() ?? null,
    screenshot: screenshotName,
    metrics,
    consoleErrors,
  };
}

async function run() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const devServer = startDevServer();

  try {
    await waitForServer(`${BASE_URL}/`);

    await createAndVerifyUser(accountUser);
    await createAndVerifyUser(adminUser);

    const browser = await chromium.launch({ headless: true });
    const accountContext = await browser.newContext();
    const adminContext = await browser.newContext();
    const accountPage = await accountContext.newPage();
    const adminPage = await adminContext.newPage();
    const report = [];

    await signInWithUi(accountContext, accountUser, "/account");
    await signInWithUi(adminContext, adminUser, "/admin");

    for (const viewport of viewports) {
      await accountPage.setViewportSize(viewport);
      for (const target of accountPages) {
        report.push(
          await capturePageSnapshot({
            page: accountPage,
            role: "account",
            id: target.id,
            url: target.url,
            viewport,
          }),
        );
      }

      await adminPage.setViewportSize(viewport);
      for (const panel of adminPanels) {
        report.push(
          await capturePageSnapshot({
            page: adminPage,
            role: "admin",
            id: panel.id,
            url: "/admin",
            viewport,
            afterLoad: panel.navLabel
              ? async (page) => {
                  await page
                    .locator("aside")
                    .getByRole("button", { name: panel.navLabel, exact: true })
                    .first()
                    .click({ timeout: 12_000 });
                  await page.waitForTimeout(350);
                }
              : undefined,
          }),
        );
      }
    }

    await accountPage.close();
    await adminPage.close();
    await accountContext.close();
    await adminContext.close();
    await browser.close();

    await writeFile(
      path.join(OUTPUT_DIR, "report.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
    await writeFile(
      path.join(OUTPUT_DIR, "summary.json"),
      JSON.stringify(
        report.map((entry) => ({
          role: entry.role,
          page: entry.page,
          pageId: entry.pageId,
          viewport: `${entry.viewport.width}x${entry.viewport.height}`,
          status: entry.status,
          overflow: entry.metrics.horizontalOverflow,
          errors: entry.consoleErrors.length,
        })),
        null,
        2,
      ),
      "utf8",
    );
  } finally {
    await stopDevServer(devServer);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
