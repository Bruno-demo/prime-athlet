#!/usr/bin/env node

const errors = [];
const warnings = [];

const ADMIN_ROLE_SET = new Set(["owner", "manager", "support", "analyst"]);
const PLACEHOLDER_PATTERNS = [
  /example\.com/i,
  /replace[-_ ]with/i,
  /\bchangeme\b/i,
  /\byour[_-]?/i,
  /\bxxx\b/i,
];

function getEnv(name) {
  return (process.env[name] || "").trim();
}

function hasPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function requireEnv(name) {
  const value = getEnv(name);
  if (!value) {
    addError(`${name} is required.`);
    return "";
  }
  return value;
}

function parseBoolean(value, fallback = false) {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseCsvPairs(name) {
  const raw = getEnv(name);
  if (!raw) {
    return [];
  }
  const parts = raw.split(",");
  if (parts.some((part) => part.trim().length === 0)) {
    addError(`${name} contains an empty item (often caused by a trailing comma).`);
  }
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const delimiterIndex = part.indexOf(":");
      if (delimiterIndex <= 0 || delimiterIndex === part.length - 1) {
        addError(`${name} item "${part}" must use "email:value" format.`);
        return null;
      }
      const email = part.slice(0, delimiterIndex).trim().toLowerCase();
      const value = part.slice(delimiterIndex + 1).trim();
      return { email, value, raw: part };
    })
    .filter(Boolean);
}

function validateUrl() {
  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  if (!appUrl) {
    return;
  }

  let parsed;
  try {
    parsed = new URL(appUrl);
  } catch {
    addError("NEXT_PUBLIC_APP_URL must be a valid URL.");
    return;
  }

  if (parsed.protocol !== "https:") {
    addError("NEXT_PUBLIC_APP_URL must use https in production.");
  }

  if (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname.endsWith(".ngrok-free.dev") ||
    parsed.hostname.endsWith(".ngrok-free.app")
  ) {
    addError("NEXT_PUBLIC_APP_URL must be a real production domain (not localhost/ngrok).");
  }
}

function validateMongo() {
  const uri = requireEnv("MONGODB_URI");
  const db = requireEnv("MONGODB_DB");

  if (uri) {
    if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
      addError("MONGODB_URI must start with mongodb:// or mongodb+srv://.");
    }
    if (hasPlaceholder(uri)) {
      addError("MONGODB_URI contains placeholder text.");
    }
    if (/<[^>]+>/.test(uri)) {
      addError("MONGODB_URI contains placeholder brackets (for example <username>/<password>).");
    }
  }

  if (db && hasPlaceholder(db)) {
    addError("MONGODB_DB contains placeholder text.");
  }
}

function validateStripe() {
  const stripeSecret = requireEnv("STRIPE_SECRET_KEY");
  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");

  if (stripeSecret) {
    if (stripeSecret.startsWith("sk_test_")) {
      addError("STRIPE_SECRET_KEY is test mode. Use a live key for production.");
    } else if (!stripeSecret.startsWith("sk_live_")) {
      addWarning("STRIPE_SECRET_KEY does not match expected sk_live_ prefix.");
    }
  }

  if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
    addError("STRIPE_WEBHOOK_SECRET must start with whsec_.");
  }
}

function validatePayPal() {
  const clientId = requireEnv("PAYPAL_CLIENT_ID");
  const clientSecret = requireEnv("PAYPAL_CLIENT_SECRET");
  const env = requireEnv("PAYPAL_ENV");

  if (hasPlaceholder(clientId) || hasPlaceholder(clientSecret)) {
    addError("PayPal credentials contain placeholder text.");
  }

  if (env.toLowerCase() !== "live") {
    addError('PAYPAL_ENV must be "live" for production.');
  }
}

function validateMail() {
  const emailFrom = requireEnv("EMAIL_FROM");
  const host = requireEnv("SMTP_HOST");
  const port = requireEnv("SMTP_PORT");
  const user = requireEnv("SMTP_USER");
  const pass = requireEnv("SMTP_PASS");

  if (emailFrom && hasPlaceholder(emailFrom)) {
    addError("EMAIL_FROM contains placeholder text.");
  }
  if (host && hasPlaceholder(host)) {
    addError("SMTP_HOST contains placeholder text.");
  }
  if (user && hasPlaceholder(user)) {
    addError("SMTP_USER contains placeholder text.");
  }
  if (pass && hasPlaceholder(pass)) {
    addError("SMTP_PASS contains placeholder text.");
  }

  const parsedPort = Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    addError("SMTP_PORT must be a valid TCP port (1-65535).");
  }
}

function validateAdminSecurity() {
  const require2fa = parseBoolean(getEnv("ADMIN_REQUIRE_2FA"));
  if (!require2fa) {
    addError("ADMIN_REQUIRE_2FA must be true in production.");
  }

  const debugLinksEnabled = parseBoolean(getEnv("EXPOSE_AUTH_DEBUG_LINKS"));
  if (debugLinksEnabled) {
    addError("EXPOSE_AUTH_DEBUG_LINKS must be false in production.");
  }

  const encryptionKey = requireEnv("ADMIN_2FA_ENCRYPTION_KEY");
  if (encryptionKey.length < 32) {
    addError("ADMIN_2FA_ENCRYPTION_KEY must be at least 32 characters.");
  }
  if (hasPlaceholder(encryptionKey)) {
    addError("ADMIN_2FA_ENCRYPTION_KEY contains placeholder text.");
  }

  const roleAssignments = parseCsvPairs("ADMIN_ROLE_ASSIGNMENTS");
  if (roleAssignments.length === 0) {
    addError("ADMIN_ROLE_ASSIGNMENTS must contain at least one admin.");
  }
  for (const assignment of roleAssignments) {
    if (!assignment.email.includes("@")) {
      addError(`ADMIN_ROLE_ASSIGNMENTS entry "${assignment.raw}" has invalid email.`);
    }
    if (!ADMIN_ROLE_SET.has(assignment.value.toLowerCase())) {
      addError(
        `ADMIN_ROLE_ASSIGNMENTS entry "${assignment.raw}" has invalid role. Allowed: owner, manager, support, analyst.`,
      );
    }
  }

  const twoFaSecrets = parseCsvPairs("ADMIN_2FA_SECRETS");
  for (const entry of twoFaSecrets) {
    if (!entry.email.includes("@")) {
      addError(`ADMIN_2FA_SECRETS entry "${entry.raw}" has invalid email.`);
    }
    if (!/^[A-Z2-7]+=*$/i.test(entry.value)) {
      addError(`ADMIN_2FA_SECRETS entry "${entry.raw}" must be a Base32 secret.`);
    }
  }
}

function validateOptionalStorage() {
  const s3Fields = [
    "S3_BUCKET",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ];
  const providedCount = s3Fields.filter((key) => getEnv(key).length > 0).length;
  if (providedCount > 0 && providedCount < s3Fields.length) {
    addError(
      "S3 configuration is partial. Provide S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY together.",
    );
  }
}

function validateRuntimeMode() {
  const nodeEnv = getEnv("NODE_ENV");
  if (nodeEnv !== "production") {
    addError(`NODE_ENV must be "production" for go-live gate (found "${nodeEnv || "unset"}").`);
  }
}

function validateDevTunnelFlags() {
  if (getEnv("NGROK_AUTHTOKEN")) {
    addWarning("NGROK_AUTHTOKEN is set. Avoid shipping dev tunnel credentials in production env.");
  }
}

function main() {
  validateRuntimeMode();
  validateUrl();
  validateMongo();
  validateStripe();
  validatePayPal();
  validateMail();
  validateAdminSecurity();
  validateOptionalStorage();
  validateDevTunnelFlags();

  console.log("Production preflight checks:");
  if (errors.length === 0 && warnings.length === 0) {
    console.log("  PASS - no issues detected.");
    process.exit(0);
  }

  if (errors.length > 0) {
    console.log(`  FAIL - ${errors.length} blocking issue(s):`);
    for (const [index, error] of errors.entries()) {
      console.log(`    ${index + 1}. ${error}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`  WARN - ${warnings.length} warning(s):`);
    for (const [index, warning] of warnings.entries()) {
      console.log(`    ${index + 1}. ${warning}`);
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
