import { NextResponse } from "next/server";

import {
  PromotionCartItem,
  resolvePromotionsForCart,
} from "@/lib/promotions-repository";

export const runtime = "nodejs";

interface ValidatePromotionPayload {
  code?: string;
  items: PromotionCartItem[];
}

function parsePayload(payload: unknown): ValidatePromotionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const codeRaw = body.code;
  const code =
    typeof codeRaw === "string" && codeRaw.trim().length > 0
      ? codeRaw.trim().toUpperCase()
      : undefined;

  if (code && !/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) {
    return null;
  }

  if (!Array.isArray(body.items)) {
    return null;
  }

  const items = body.items
    .map((item): PromotionCartItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const candidate = item as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const sport =
        typeof candidate.sport === "string" ? candidate.sport.trim() : "";
      const category =
        typeof candidate.category === "string"
          ? candidate.category.trim()
          : "";
      const quantity =
        typeof candidate.quantity === "number"
          ? candidate.quantity
          : Number.NaN;
      const unitAmountCents =
        typeof candidate.unitAmountCents === "number"
          ? candidate.unitAmountCents
          : Number.NaN;

      if (
        id.length < 2 ||
        sport.length < 2 ||
        category.length < 2 ||
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        quantity > 99 ||
        !Number.isInteger(unitAmountCents) ||
        unitAmountCents <= 0 ||
        unitAmountCents > 20_000_000
      ) {
        return null;
      }

      return {
        id,
        sport,
        category,
        quantity,
        unitAmountCents,
      };
    })
    .filter((item): item is PromotionCartItem => item !== null);

  if (items.length === 0) {
    return null;
  }

  return {
    code,
    items,
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = parsePayload(payload);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid promotion validation payload." },
        { status: 400 },
      );
    }

    const resolution = await resolvePromotionsForCart({
      code: parsed.code,
      items: parsed.items,
    });

    return NextResponse.json(
      {
        valid: resolution.valid,
        reason: resolution.reason,
        subtotalCents: resolution.subtotalCents,
        discountCents: resolution.totalDiscountCents,
        finalSubtotalCents: resolution.finalSubtotalCents,
        appliedPromotions: resolution.appliedPromotions,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to validate promotion code.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

