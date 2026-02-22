import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { getProductById } from "@/lib/products-repository";
import {
  getRecentProductReviews,
  upsertProductReview,
} from "@/lib/reviews-repository";
import { revalidateStorefrontCaches } from "@/lib/storefront-cache";

export const runtime = "nodejs";

interface ReviewPayload {
  productId: string;
  rating: number;
  title: string;
  comment: string;
}

function jsonNoStore(data: unknown, init?: Omit<ResponseInit, "headers">): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function toSafeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }
  return null;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ");
}

function parseReviewPayload(payload: unknown): ReviewPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const productId = normalizeText(body.productId);
  const ratingValue = toSafeInteger(body.rating);
  const title = normalizeText(body.title);
  const comment = normalizeText(body.comment);

  if (productId.length < 2 || productId.length > 120) {
    return null;
  }
  if (ratingValue === null || ratingValue < 1 || ratingValue > 5) {
    return null;
  }
  if (title.length < 3 || title.length > 120) {
    return null;
  }
  if (comment.length < 12 || comment.length > 2000) {
    return null;
  }

  return {
    productId,
    rating: ratingValue,
    title,
    comment,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const productId = normalizeText(url.searchParams.get("productId"));
    const requestedLimit = toSafeInteger(url.searchParams.get("limit"));
    const limit =
      requestedLimit === null
        ? productId.length > 0
          ? 500
          : 12
        : Math.min(Math.max(requestedLimit, 1), 500);

    const reviews = await getRecentProductReviews({
      limit,
      productId: productId.length > 0 ? productId : undefined,
    });

    return jsonNoStore({
      reviews,
      count: reviews.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load reviews.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonNoStore({ error: "Authentication required." }, { status: 401 });
    }
    if (!user.emailVerifiedAt) {
      return jsonNoStore(
        { error: "Verify your email before posting reviews." },
        { status: 403 },
      );
    }

    const payload = await request.json();
    const parsed = parseReviewPayload(payload);
    if (!parsed) {
      return jsonNoStore({ error: "Invalid review payload." }, { status: 400 });
    }

    const product = await getProductById(parsed.productId);
    if (!product) {
      return jsonNoStore({ error: "Product not found." }, { status: 404 });
    }

    const review = await upsertProductReview({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName,
      productId: product.id,
      productName: product.name,
      sport: product.sport,
      rating: parsed.rating,
      title: parsed.title,
      comment: parsed.comment,
    });

    revalidatePath("/reviews");
    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath(`/shop/${product.id}`);
    revalidateStorefrontCaches();

    return jsonNoStore({
      review,
      message: "Review submitted.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to submit review.";
    const status = /not configured/i.test(message) ? 503 : 500;
    return jsonNoStore({ error: message }, { status });
  }
}
