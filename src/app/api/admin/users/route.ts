import { NextResponse } from "next/server";

import {
  getAdminAssignmentOverrideByEmail,
  revokeAdminAccessOverride,
  setAdminRoleOverride,
} from "@/lib/admin-assignments-repository";
import {
  resolveAdminAccessByEmailWithOverrides,
  resolveEffectiveAdminAssignmentByEmail,
} from "@/lib/admin-access";
import { requireAdminForApi } from "@/lib/admin-auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { getConfiguredAdminRoleAssignments, isAdminRole } from "@/lib/admin-roles";
import {
  enforceAdminMutationRateLimit,
  requireAdminCsrf,
} from "@/lib/admin-security";
import { deleteSessionsByUserId } from "@/lib/sessions-repository";
import { findUserByEmail, getUsersPage } from "@/lib/users-repository";

export const runtime = "nodejs";

type AdminUserMutationAction = "set-role" | "revoke-admin" | "force-logout";

interface AdminUsersMutationPayload {
  action: AdminUserMutationAction;
  email: string;
  role?: string;
}

function parsePositiveInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parsePayload(payload: unknown): AdminUsersMutationPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const action =
    typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const role = typeof body.role === "string" ? body.role.trim().toLowerCase() : undefined;

  if (
    (action !== "set-role" &&
      action !== "revoke-admin" &&
      action !== "force-logout") ||
    !email ||
    !isValidEmail(email)
  ) {
    return null;
  }

  return {
    action,
    email,
    role,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminForApi("admin:security:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100_000);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 1, 100);

    const [usersPage, envAssignments] = await Promise.all([
      getUsersPage({ q, page, pageSize }),
      Promise.resolve(getConfiguredAdminRoleAssignments()),
    ]);

    const users = await Promise.all(
      usersPage.users.map(async (user) => {
        const [effective, override] = await Promise.all([
          resolveEffectiveAdminAssignmentByEmail(user.email),
          getAdminAssignmentOverrideByEmail(user.email),
        ]);

        return {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerifiedAt: user.emailVerifiedAt,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          adminRole: effective.role,
          adminSource: effective.source,
          adminDisabledByOverride: effective.disabledByOverride,
          override,
        };
      }),
    );

    const envOnlyAssignments = envAssignments
      .filter((assignment) => !users.some((user) => user.email === assignment.email))
      .filter((assignment) =>
        q.trim().length > 0
          ? assignment.email.includes(q.trim().toLowerCase())
          : true,
      )
      .slice(0, 50)
      .map((assignment) => ({
        email: assignment.email,
        role: assignment.role,
      }));

    return NextResponse.json(
      {
        users,
        pagination: usersPage.pagination,
        envOnlyAssignments,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load admin users.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminForApi("admin:security:write");
  if (auth.response) {
    return auth.response;
  }

  const csrfError = requireAdminCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = await enforceAdminMutationRateLimit({
    request,
    userId: auth.user.id,
    scope: "admin:users:post",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = parsePayload(await request.json());
    if (!payload) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "admin-user.mutate",
        resourceType: "admin-user",
        status: "failure",
        message: "Invalid admin user payload.",
        request,
      });
      return NextResponse.json({ error: "Invalid admin user payload." }, { status: 400 });
    }

    if (payload.action === "set-role") {
      if (!payload.role || !isAdminRole(payload.role)) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-user.set-role",
          resourceType: "admin-user",
          resourceId: payload.email,
          status: "failure",
          message: "Invalid role value.",
          request,
        });
        return NextResponse.json({ error: "Invalid admin role." }, { status: 400 });
      }

      if (payload.email === auth.user.email.toLowerCase()) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-user.set-role",
          resourceType: "admin-user",
          resourceId: payload.email,
          status: "failure",
          message: "Self role mutation is blocked.",
          request,
        });
        return NextResponse.json(
          { error: "You cannot change your own admin role from this session." },
          { status: 400 },
        );
      }

      const targetUser = await findUserByEmail(payload.email);
      if (!targetUser) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "admin-user.set-role",
          resourceType: "admin-user",
          resourceId: payload.email,
          status: "failure",
          message: "Target user not found.",
          request,
        });
        return NextResponse.json(
          { error: "User not found. Admin role can only be assigned to existing accounts." },
          { status: 404 },
        );
      }

      const override = await setAdminRoleOverride({
        email: payload.email,
        role: payload.role,
        actorEmail: auth.user.email,
      });
      const access = await resolveAdminAccessByEmailWithOverrides(payload.email);

      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "admin-user.set-role",
        resourceType: "admin-user",
        resourceId: payload.email,
        status: "success",
        message: `Admin role set to ${payload.role}.`,
        request,
      });

      return NextResponse.json({
        success: true,
        override,
        effectiveRole: access?.role || null,
      });
    }

    if (payload.action === "revoke-admin") {
      if (payload.email === auth.user.email.toLowerCase()) {
        return NextResponse.json(
          { error: "You cannot revoke your own admin access in this session." },
          { status: 400 },
        );
      }

      const [override, targetUser] = await Promise.all([
        revokeAdminAccessOverride({
          email: payload.email,
          actorEmail: auth.user.email,
        }),
        findUserByEmail(payload.email),
      ]);

      let revokedSessions = 0;
      if (targetUser) {
        revokedSessions = await deleteSessionsByUserId(targetUser.id);
      }

      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "admin-user.revoke-admin",
        resourceType: "admin-user",
        resourceId: payload.email,
        status: "success",
        message: "Admin access revoked.",
        metadata: {
          revokedSessions,
        },
        request,
      });

      return NextResponse.json({
        success: true,
        override,
        revokedSessions,
      });
    }

    const targetUser = await findUserByEmail(payload.email);
    if (!targetUser) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "admin-user.force-logout",
        resourceType: "admin-user",
        resourceId: payload.email,
        status: "failure",
        message: "Target user not found.",
        request,
      });
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const revokedSessions = await deleteSessionsByUserId(targetUser.id);
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "admin-user.force-logout",
      resourceType: "admin-user",
      resourceId: payload.email,
      status: "success",
      message: "User sessions revoked.",
      metadata: {
        revokedSessions,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      revokedSessions,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update admin users.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "admin-user.mutate",
      resourceType: "admin-user",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
