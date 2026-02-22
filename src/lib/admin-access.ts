import "server-only";

import {
  ResolvedAdminAccess,
  buildResolvedAdminAccess,
  getConfiguredAdminRoleAssignments,
  resolveAdminAccessByEmail,
} from "@/lib/admin-roles";
import { getAdminAssignmentOverrideByEmail } from "@/lib/admin-assignments-repository";

export interface EffectiveAdminAssignment {
  email: string;
  role: ResolvedAdminAccess["role"] | null;
  source: "database" | "environment" | "none";
  disabledByOverride: boolean;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function resolveEffectiveAdminAssignmentByEmail(
  email: string,
): Promise<EffectiveAdminAssignment> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      email: "",
      role: null,
      source: "none",
      disabledByOverride: false,
    };
  }

  const override = await getAdminAssignmentOverrideByEmail(normalizedEmail);
  if (override) {
    if (override.disabled || !override.role) {
      return {
        email: normalizedEmail,
        role: null,
        source: "database",
        disabledByOverride: true,
      };
    }

    return {
      email: normalizedEmail,
      role: override.role,
      source: "database",
      disabledByOverride: false,
    };
  }

  const envAssignments = getConfiguredAdminRoleAssignments();
  const envMatch = envAssignments.find(
    (assignment) => assignment.email === normalizedEmail,
  );
  if (envMatch) {
    return {
      email: normalizedEmail,
      role: envMatch.role,
      source: "environment",
      disabledByOverride: false,
    };
  }

  const fallback = resolveAdminAccessByEmail(normalizedEmail);
  if (fallback) {
    return {
      email: normalizedEmail,
      role: fallback.role,
      source: "environment",
      disabledByOverride: false,
    };
  }

  return {
    email: normalizedEmail,
    role: null,
    source: "none",
    disabledByOverride: false,
  };
}

export async function resolveAdminAccessByEmailWithOverrides(
  email: string,
): Promise<ResolvedAdminAccess | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const effective =
    await resolveEffectiveAdminAssignmentByEmail(normalizedEmail);
  if (!effective.role) {
    return null;
  }

  if (effective.source === "database") {
    return buildResolvedAdminAccess(
      normalizedEmail,
      effective.role,
      "database",
    );
  }

  const envResolved = resolveAdminAccessByEmail(normalizedEmail);
  if (!envResolved) {
    return null;
  }

  return {
    ...envResolved,
    assignmentSource: "environment",
  };
}
