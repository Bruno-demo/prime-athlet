import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { resolveAdminAccessByEmailWithOverrides } from "@/lib/admin-access";
import { resolveEffectiveAdminTotpSecret } from "@/lib/admin-two-factor";
import {
  AdminPermission,
  ResolvedAdminAccess,
  hasAdminPermission,
  isAdminMfaFresh,
} from "@/lib/admin-roles";
import { getUserAdminTwoFactorState } from "@/lib/users-repository";

function buildAdminReauthUrl(nextPath: string): string {
  const params = new URLSearchParams({
    next: nextPath,
    adminReauth: "1",
  });
  return `/auth/sign-in?${params.toString()}`;
}

async function resolveAdminUserAccess(
  userEmail: string,
  userId: string,
): Promise<ResolvedAdminAccess | null> {
  const base = await resolveAdminAccessByEmailWithOverrides(userEmail);
  if (!base) {
    return null;
  }

  if (!base.twoFactorRequired) {
    return base;
  }

  const userAdminTwoFactor = await getUserAdminTwoFactorState(userId);
  const effective = resolveEffectiveAdminTotpSecret({
    userAdminTwoFactor,
    environmentSecret: base.twoFactorSecret,
  });

  return {
    ...base,
    twoFactorConfigured: Boolean(effective.secret),
    twoFactorSecret: effective.secret,
  };
}

function requiresAdminTwoFactor(
  access: ResolvedAdminAccess,
  adminMfaVerifiedAt: string | null,
): boolean {
  if (!access.twoFactorRequired) {
    return false;
  }
  if (!access.twoFactorConfigured) {
    return true;
  }
  return !isAdminMfaFresh(adminMfaVerifiedAt);
}

export async function requireAdminForPage(
  permission: AdminPermission = "admin:dashboard:read",
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect(buildAdminReauthUrl("/admin"));
  }
  if (!user.emailVerifiedAt) {
    redirect(`/auth/check-email?email=${encodeURIComponent(user.email)}`);
  }

  const adminAccess = await resolveAdminUserAccess(user.email, user.id);
  if (!adminAccess) {
    redirect("/");
  }

  if (!hasAdminPermission(adminAccess.role, permission)) {
    redirect("/");
  }

  if (adminAccess.twoFactorRequired && !adminAccess.twoFactorConfigured) {
    redirect("/account?admin_error=2fa-not-configured");
  }

  if (requiresAdminTwoFactor(adminAccess, user.adminMfaVerifiedAt)) {
    redirect(buildAdminReauthUrl("/admin"));
  }

  return {
    user,
    admin: adminAccess,
  };
}

export async function requireAdminForApi(
  permission: AdminPermission = "admin:dashboard:read",
): Promise<
  | {
      user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;
      admin: ResolvedAdminAccess;
      response: null;
    }
  | { user: null; admin: null; response: NextResponse }
> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      user: null,
      admin: null,
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  if (!user.emailVerifiedAt) {
    return {
      user: null,
      admin: null,
      response: NextResponse.json(
        { error: "Verify your email before accessing admin tools." },
        { status: 403 },
      ),
    };
  }

  const adminAccess = await resolveAdminUserAccess(user.email, user.id);
  if (!adminAccess) {
    return {
      user: null,
      admin: null,
      response: NextResponse.json(
        { error: "Admin access is restricted." },
        { status: 403 },
      ),
    };
  }

  if (!hasAdminPermission(adminAccess.role, permission)) {
    return {
      user: null,
      admin: null,
      response: NextResponse.json(
        { error: "Your admin role does not allow this action." },
        { status: 403 },
      ),
    };
  }

  if (adminAccess.twoFactorRequired && !adminAccess.twoFactorConfigured) {
    return {
      user: null,
      admin: null,
      response: NextResponse.json(
        {
          error: "Admin account requires 2FA setup before access.",
          requiresTwoFactor: true,
          setupRequired: true,
        },
        { status: 403 },
      ),
    };
  }

  if (requiresAdminTwoFactor(adminAccess, user.adminMfaVerifiedAt)) {
    return {
      user: null,
      admin: null,
      response: NextResponse.json(
        {
          error:
            "Admin verification expired. Sign in again with your 2FA code.",
          requiresTwoFactor: true,
        },
        { status: 401 },
      ),
    };
  }

  return {
    user,
    admin: adminAccess,
    response: null,
  };
}
