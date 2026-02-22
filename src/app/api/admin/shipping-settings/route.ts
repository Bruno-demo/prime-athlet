import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import {
  enforceAdminMutationRateLimit,
  requireAdminCsrf,
} from "@/lib/admin-security";
import {
  getShippingSettings,
  updateShippingSettings,
} from "@/lib/shipping-settings-repository";

export const runtime = "nodejs";

interface ShippingSettingsPayload {
  flatRateCents: number;
  freeShippingThresholdCents: number;
}

function parsePayload(payload: unknown): ShippingSettingsPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const body = payload as Partial<ShippingSettingsPayload>;
  if (
    typeof body.flatRateCents !== "number" ||
    !Number.isFinite(body.flatRateCents) ||
    body.flatRateCents < 0 ||
    body.flatRateCents > 50_000
  ) {
    return null;
  }
  if (
    typeof body.freeShippingThresholdCents !== "number" ||
    !Number.isFinite(body.freeShippingThresholdCents) ||
    body.freeShippingThresholdCents < 0 ||
    body.freeShippingThresholdCents > 1_000_000
  ) {
    return null;
  }
  return {
    flatRateCents: Math.floor(body.flatRateCents),
    freeShippingThresholdCents: Math.floor(body.freeShippingThresholdCents),
  };
}

export async function GET() {
  const auth = await requireAdminForApi("admin:security:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const settings = await getShippingSettings();
    return NextResponse.json(
      {
        flatRateCents: settings.flatRateCents,
        freeShippingThresholdCents: settings.freeShippingThresholdCents,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load shipping settings.";
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
    scope: "admin:shipping-settings:post",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const parsed = parsePayload(await request.json());
    if (!parsed) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "shipping-settings.update",
        resourceType: "shipping-settings",
        status: "failure",
        message: "Invalid shipping settings payload.",
        request,
      });
      return NextResponse.json(
        { error: "Invalid shipping settings payload." },
        { status: 400 },
      );
    }

    const nextSettings = await updateShippingSettings({
      flatRateCents: parsed.flatRateCents,
      freeShippingThresholdCents: parsed.freeShippingThresholdCents,
      actorEmail: auth.user.email,
    });

    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "shipping-settings.update",
      resourceType: "shipping-settings",
      status: "success",
      message: "Shipping settings updated.",
      metadata: {
        flatRateCents: nextSettings.flatRateCents,
        freeShippingThresholdCents: nextSettings.freeShippingThresholdCents,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      flatRateCents: nextSettings.flatRateCents,
      freeShippingThresholdCents: nextSettings.freeShippingThresholdCents,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update shipping settings.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "shipping-settings.update",
      resourceType: "shipping-settings",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
