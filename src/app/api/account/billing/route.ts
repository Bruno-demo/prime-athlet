import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { BillingProfile } from "@/lib/account-types";
import { updateUserBillingProfile } from "@/lib/users-repository";

export const runtime = "nodejs";

function sanitizeValue(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function parseBillingProfile(payload: unknown): BillingProfile | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const profile: BillingProfile = {
    fullName: sanitizeValue(body.fullName, 80),
    company: sanitizeValue(body.company, 80),
    phone: sanitizeValue(body.phone, 30),
    line1: sanitizeValue(body.line1, 100),
    line2: sanitizeValue(body.line2, 100),
    city: sanitizeValue(body.city, 80),
    state: sanitizeValue(body.state, 60),
    postalCode: sanitizeValue(body.postalCode, 20),
    country: sanitizeValue(body.country, 60),
    taxId: sanitizeValue(body.taxId, 40),
  };

  if (
    profile.fullName.length < 2 ||
    profile.line1.length < 3 ||
    profile.city.length < 2 ||
    profile.state.length < 2 ||
    profile.postalCode.length < 3 ||
    profile.country.length < 2
  ) {
    return null;
  }

  return profile;
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        { error: "Email verification required." },
        { status: 403 },
      );
    }

    return NextResponse.json({ billingProfile: user.billingProfile });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load billing profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        { error: "Email verification required." },
        { status: 403 },
      );
    }

    const payload = await request.json();
    const billingProfile = parseBillingProfile(payload);
    if (!billingProfile) {
      return NextResponse.json(
        { error: "Invalid billing profile payload." },
        { status: 400 },
      );
    }

    const updatedUser = await updateUserBillingProfile(user.id, billingProfile);
    if (!updatedUser) {
      return NextResponse.json(
        { error: "Could not update billing profile." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      billingProfile: updatedUser.billingProfile,
      user: updatedUser,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update billing profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
