import "server-only";

export type AdminRole = "owner" | "manager" | "support" | "analyst";
export type AdminAssignmentSource = "environment" | "database";

export type AdminPermission =
  | "admin:dashboard:read"
  | "admin:summary:read"
  | "admin:products:read"
  | "admin:products:write"
  | "admin:promotions:read"
  | "admin:promotions:write"
  | "admin:orders:read"
  | "admin:orders:write"
  | "admin:media:read"
  | "admin:media:write"
  | "admin:security:read"
  | "admin:security:write";

interface RoleConfig {
  permissions: ReadonlySet<AdminPermission> | "*";
}

const OWNER_PERMISSIONS = "*" as const;

const MANAGER_PERMISSIONS = new Set<AdminPermission>([
  "admin:dashboard:read",
  "admin:summary:read",
  "admin:products:read",
  "admin:products:write",
  "admin:promotions:read",
  "admin:promotions:write",
  "admin:orders:read",
  "admin:orders:write",
  "admin:media:read",
  "admin:media:write",
  "admin:security:read",
  "admin:security:write",
]);

const SUPPORT_PERMISSIONS = new Set<AdminPermission>([
  "admin:dashboard:read",
  "admin:summary:read",
  "admin:products:read",
  "admin:promotions:read",
  "admin:orders:read",
  "admin:orders:write",
  "admin:media:read",
  "admin:security:read",
  "admin:security:write",
]);

const ANALYST_PERMISSIONS = new Set<AdminPermission>([
  "admin:dashboard:read",
  "admin:summary:read",
  "admin:products:read",
  "admin:promotions:read",
  "admin:orders:read",
  "admin:media:read",
  "admin:security:read",
  "admin:security:write",
]);

const ROLE_CONFIG: Record<AdminRole, RoleConfig> = {
  owner: {
    permissions: OWNER_PERMISSIONS,
  },
  manager: {
    permissions: MANAGER_PERMISSIONS,
  },
  support: {
    permissions: SUPPORT_PERMISSIONS,
  },
  analyst: {
    permissions: ANALYST_PERMISSIONS,
  },
};

export interface ResolvedAdminAccess {
  email: string;
  role: AdminRole;
  permissions: AdminPermission[];
  assignmentSource: AdminAssignmentSource;
  twoFactorRequired: boolean;
  twoFactorConfigured: boolean;
  twoFactorSecret: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function splitAssignments(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseAdminRole(value: string): AdminRole | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "owner" ||
    normalized === "manager" ||
    normalized === "support" ||
    normalized === "analyst"
  ) {
    return normalized;
  }
  return null;
}

export function isAdminRole(value: string): value is AdminRole {
  return parseAdminRole(value) !== null;
}

function parseBooleanFlag(
  value: string | undefined,
  fallback: boolean,
): boolean {
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

function parseAdminRoleAssignments(): Map<string, AdminRole> {
  const assignments = new Map<string, AdminRole>();
  const roleRaw = process.env.ADMIN_ROLE_ASSIGNMENTS || "";

  for (const entry of splitAssignments(roleRaw)) {
    const delimiterIndex = entry.indexOf(":");
    if (delimiterIndex <= 0 || delimiterIndex >= entry.length - 1) {
      continue;
    }

    const email = normalizeEmail(entry.slice(0, delimiterIndex));
    const role = parseAdminRole(entry.slice(delimiterIndex + 1));
    if (!email || !role) {
      continue;
    }

    assignments.set(email, role);
  }

  if (assignments.size > 0) {
    return assignments;
  }

  const fallbackAllowlist = process.env.ADMIN_EMAILS || "";
  for (const email of splitAssignments(fallbackAllowlist)) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      continue;
    }
    assignments.set(normalizedEmail, "owner");
  }

  return assignments;
}

export function getConfiguredAdminRoleAssignments(): Array<{
  email: string;
  role: AdminRole;
}> {
  return Array.from(parseAdminRoleAssignments().entries()).map(
    ([email, role]) => ({
      email,
      role,
    }),
  );
}

function normalizeTotpSecret(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
}

function parseAdminTotpSecretAssignments(): Map<string, string> {
  const secrets = new Map<string, string>();
  const raw = process.env.ADMIN_2FA_SECRETS || "";

  for (const entry of splitAssignments(raw)) {
    const delimiterIndex = entry.indexOf(":");
    if (delimiterIndex <= 0 || delimiterIndex >= entry.length - 1) {
      continue;
    }

    const email = normalizeEmail(entry.slice(0, delimiterIndex));
    const secret = normalizeTotpSecret(entry.slice(delimiterIndex + 1));
    if (!email || secret.length < 16) {
      continue;
    }

    secrets.set(email, secret);
  }

  return secrets;
}

export function getConfiguredAdminTwoFactorSecret(
  email: string,
): string | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }
  return parseAdminTotpSecretAssignments().get(normalizedEmail) || null;
}

export function isAdminTwoFactorRequired(): boolean {
  return parseBooleanFlag(
    process.env.ADMIN_REQUIRE_2FA,
    process.env.NODE_ENV === "production",
  );
}

export function getAdminMfaMaxAgeSeconds(): number {
  const parsed = Number(process.env.ADMIN_MFA_MAX_AGE_SECONDS || "43200");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 43_200;
  }
  const rounded = Math.floor(parsed);
  return Math.min(Math.max(rounded, 60), 86_400);
}

export function buildResolvedAdminAccess(
  email: string,
  role: AdminRole,
  assignmentSource: AdminAssignmentSource = "environment",
): ResolvedAdminAccess {
  const normalizedEmail = normalizeEmail(email);
  const twoFactorRequired = isAdminTwoFactorRequired();
  const twoFactorSecret = getConfiguredAdminTwoFactorSecret(normalizedEmail);

  return {
    email: normalizedEmail,
    role,
    permissions: getAdminPermissionsForRole(role),
    assignmentSource,
    twoFactorRequired,
    twoFactorConfigured: !twoFactorRequired || Boolean(twoFactorSecret),
    twoFactorSecret,
  };
}

export function resolveAdminAccessByEmail(
  email: string,
): ResolvedAdminAccess | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const assignments = parseAdminRoleAssignments();
  const role = assignments.get(normalizedEmail) || null;
  if (!role) {
    return null;
  }

  return buildResolvedAdminAccess(normalizedEmail, role, "environment");
}

export function hasAdminPermission(
  role: AdminRole,
  permission: AdminPermission,
): boolean {
  const config = ROLE_CONFIG[role];
  if (!config) {
    return false;
  }

  if (config.permissions === "*") {
    return true;
  }

  return config.permissions.has(permission);
}

export function getAdminPermissionsForRole(role: AdminRole): AdminPermission[] {
  const config = ROLE_CONFIG[role];
  if (!config) {
    return [];
  }
  if (config.permissions === "*") {
    return [
      "admin:dashboard:read",
      "admin:summary:read",
      "admin:products:read",
      "admin:products:write",
      "admin:promotions:read",
      "admin:promotions:write",
      "admin:orders:read",
      "admin:orders:write",
      "admin:media:read",
      "admin:media:write",
      "admin:security:read",
      "admin:security:write",
    ];
  }
  return Array.from(config.permissions.values());
}

export function isAdminMfaFresh(
  adminMfaVerifiedAt: string | null | undefined,
): boolean {
  if (!adminMfaVerifiedAt) {
    return false;
  }

  const timestamp = Date.parse(adminMfaVerifiedAt);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  const maxAgeMs = getAdminMfaMaxAgeSeconds() * 1000;
  return Date.now() - timestamp <= maxAgeMs;
}
