import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || "3210");
const baseURL = `http://localhost:${port}`;
const runId = Date.now().toString(36);
const useStableLocalAccounts = !process.env.CI;

const smokeAdminEmail =
  process.env.PW_SMOKE_ADMIN_EMAIL ||
  (useStableLocalAccounts
    ? "pw-admin-smoke@sportiva.test"
    : `pw-admin-${runId}@sportiva.test`);
const smokeTargetEmail =
  process.env.PW_SMOKE_TARGET_EMAIL ||
  (useStableLocalAccounts
    ? "pw-target-smoke@sportiva.test"
    : `pw-target-${runId}@sportiva.test`);
const smokeAdminPassword =
  process.env.PW_SMOKE_ADMIN_PASSWORD || "AdminSmokePass!123";
const smokeTargetPassword =
  process.env.PW_SMOKE_TARGET_PASSWORD || "ClientSmokePass!123";

process.env.PW_SMOKE_ADMIN_EMAIL = smokeAdminEmail;
process.env.PW_SMOKE_TARGET_EMAIL = smokeTargetEmail;
process.env.PW_SMOKE_ADMIN_PASSWORD = smokeAdminPassword;
process.env.PW_SMOKE_TARGET_PASSWORD = smokeTargetPassword;

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: baseURL,
    timeout: 420_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      PORT: String(port),
      NEXT_PUBLIC_APP_URL: baseURL,
      ADMIN_ROLE_ASSIGNMENTS: `${smokeAdminEmail}:owner`,
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
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
