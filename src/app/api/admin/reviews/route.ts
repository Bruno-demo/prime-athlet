import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import {
  enforceAdminMutationRateLimit,
  requireAdminCsrf,
} from "@/lib/admin-security";
import {
  AdminReviewModerationAction,
  getAdminProductReviewsPage,
  moderateProductReview,
} from "@/lib/reviews-repository";
import { revalidateStorefrontCaches } from "@/lib/storefront-cache";

export const runtime = "nodejs";

interface ModeratePayload {
  action: AdminReviewModerationAction;
  reviewId: string;
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

function parseModerationPayload(payload: unknown): ModeratePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const action =
    typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const reviewId =
    typeof body.reviewId === "string" ? body.reviewId.trim() : "";

  if (
    (action !== "approve" && action !== "hide" && action !== "delete") ||
    reviewId.length === 0
  ) {
    return null;
  }

  return {
    action: action as AdminReviewModerationAction,
    reviewId,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminForApi("admin:products:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100_000);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 1, 100);
    const q = searchParams.get("q") || "";
    const status = searchParams.get("status") || "";
    const productId = searchParams.get("productId") || "";

    const result = await getAdminProductReviewsPage({
      page,
      pageSize,
      q,
      status,
      productId,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load reviews.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminForApi("admin:products:write");
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
    scope: "admin:reviews:post",
    limit: 45,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const parsed = parseModerationPayload(await request.json());
    if (!parsed) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "review.moderate",
        resourceType: "review",
        status: "failure",
        message: "Invalid review moderation payload.",
        request,
      });
      return NextResponse.json(
        { error: "Invalid review moderation payload." },
        { status: 400 },
      );
    }

    const moderation = await moderateProductReview({
      reviewId: parsed.reviewId,
      action: parsed.action,
    });

    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: `review.${parsed.action}`,
      resourceType: "review",
      resourceId: parsed.reviewId,
      status: "success",
      message: moderation.changed
        ? "Review moderation applied."
        : "Review moderation skipped (no change).",
      metadata: {
        action: parsed.action,
        changed: moderation.changed,
        deleted: moderation.deleted,
        productId: moderation.review?.productId ?? null,
      },
      request,
    });

    const affectedProductId = moderation.review?.productId;
    revalidatePath("/reviews");
    revalidatePath("/");
    revalidatePath("/shop");
    if (affectedProductId) {
      revalidatePath(`/shop/${affectedProductId}`);
    }
    revalidateStorefrontCaches();

    return NextResponse.json(
      {
        success: true,
        moderation,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to moderate review.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "review.moderate",
      resourceType: "review",
      status: "failure",
      message,
      request,
    });
    const status = /invalid review id/i.test(message)
      ? 400
      : /review not found/i.test(message)
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
