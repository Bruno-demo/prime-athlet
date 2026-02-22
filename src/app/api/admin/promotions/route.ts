import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import {
  enforceAdminMutationRateLimit,
  requireAdminCsrf,
} from "@/lib/admin-security";
import {
  AdminPromotionStatusFilter,
  deletePromotionById,
  getAdminPromotionsPage,
  Promotion,
  PromotionDiscountType,
  PromotionStackMode,
  PromotionTriggerType,
  upsertPromotion,
} from "@/lib/promotions-repository";

export const runtime = "nodejs";

const promotionStatusSet = new Set<AdminPromotionStatusFilter>([
  "all",
  "active",
  "scheduled",
  "expired",
  "inactive",
]);

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

interface PromotionPayload {
  id?: string;
  code: string;
  name: string;
  description?: string;
  triggerType?: PromotionTriggerType;
  stackMode?: PromotionStackMode;
  priority?: number;
  scope?: {
    sports?: string[];
    categories?: string[];
    productIds?: string[];
  };
  discountType: PromotionDiscountType;
  discountValue: number;
  minSubtotalCents?: number;
  maxDiscountCents?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  usageLimit?: number | null;
}

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function serializePromotion(promotion: Promotion) {
  return {
    id: promotion.id,
    code: promotion.code,
    name: promotion.name,
    description: promotion.description,
    triggerType: promotion.triggerType,
    stackMode: promotion.stackMode,
    priority: promotion.priority,
    scope: promotion.scope,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    minSubtotalCents: promotion.minSubtotalCents,
    maxDiscountCents: promotion.maxDiscountCents,
    startsAt: toIsoOrNull(promotion.startsAt),
    endsAt: toIsoOrNull(promotion.endsAt),
    isActive: promotion.isActive,
    usageLimit: promotion.usageLimit,
    usageCount: promotion.usageCount,
    createdAt: promotion.createdAt.toISOString(),
    updatedAt: promotion.updatedAt.toISOString(),
  };
}

function parseDate(value: unknown): Date | null | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (typeof value === "undefined") {
    return [];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  return parsed;
}

function parseDeletePayload(payload: unknown): { id: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(id)) {
    return null;
  }

  return { id };
}

function parsePromotionPayload(payload: unknown): PromotionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const rawPromotion =
    body.promotion && typeof body.promotion === "object"
      ? (body.promotion as Record<string, unknown>)
      : body;

  const id = typeof rawPromotion.id === "string" ? rawPromotion.id.trim() : undefined;
  const code =
    typeof rawPromotion.code === "string"
      ? rawPromotion.code.trim().toUpperCase()
      : "";
  const name = typeof rawPromotion.name === "string" ? rawPromotion.name.trim() : "";
  const description =
    typeof rawPromotion.description === "string" ? rawPromotion.description.trim() : "";
  const triggerType = rawPromotion.triggerType;
  const stackMode = rawPromotion.stackMode;
  const priority =
    typeof rawPromotion.priority === "number" ? rawPromotion.priority : 100;
  const discountType = rawPromotion.discountType;
  const discountValue =
    typeof rawPromotion.discountValue === "number"
      ? rawPromotion.discountValue
      : Number.NaN;
  const minSubtotalCents =
    typeof rawPromotion.minSubtotalCents === "number"
      ? rawPromotion.minSubtotalCents
      : 0;
  const maxDiscountCentsRaw = rawPromotion.maxDiscountCents;
  const usageLimitRaw = rawPromotion.usageLimit;
  const isActive =
    typeof rawPromotion.isActive === "boolean" ? rawPromotion.isActive : true;

  const rawScope =
    rawPromotion.scope && typeof rawPromotion.scope === "object"
      ? (rawPromotion.scope as Record<string, unknown>)
      : {};
  const sports = parseStringArray(rawScope.sports);
  const categories = parseStringArray(rawScope.categories);
  const productIds = parseStringArray(rawScope.productIds);

  if (
    (typeof id !== "undefined" && id.length > 0 && !/^[a-z0-9][a-z0-9-]{1,119}$/.test(id)) ||
    !/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code) ||
    name.length < 2 ||
    name.length > 80 ||
    !["code", "automatic"].includes(String(triggerType || "code")) ||
    !["stackable", "exclusive"].includes(String(stackMode || "exclusive")) ||
    !Number.isInteger(priority) ||
    priority < 0 ||
    priority > 1000 ||
    !["percent", "fixed"].includes(String(discountType)) ||
    !Number.isInteger(discountValue) ||
    discountValue <= 0 ||
    (discountType === "percent" && discountValue > 100) ||
    !Number.isInteger(minSubtotalCents) ||
    minSubtotalCents < 0 ||
    minSubtotalCents > 20_000_000 ||
    typeof sports === "undefined" ||
    typeof categories === "undefined" ||
    typeof productIds === "undefined"
  ) {
    return null;
  }

  let maxDiscountCents: number | null | undefined;
  if (typeof maxDiscountCentsRaw === "number") {
    if (
      !Number.isInteger(maxDiscountCentsRaw) ||
      maxDiscountCentsRaw <= 0 ||
      maxDiscountCentsRaw > 20_000_000
    ) {
      return null;
    }
    maxDiscountCents = maxDiscountCentsRaw;
  } else if (maxDiscountCentsRaw === null || typeof maxDiscountCentsRaw === "undefined") {
    maxDiscountCents = null;
  } else {
    return null;
  }

  let usageLimit: number | null | undefined;
  if (typeof usageLimitRaw === "number") {
    if (
      !Number.isInteger(usageLimitRaw) ||
      usageLimitRaw <= 0 ||
      usageLimitRaw > 1_000_000
    ) {
      return null;
    }
    usageLimit = usageLimitRaw;
  } else if (usageLimitRaw === null || typeof usageLimitRaw === "undefined") {
    usageLimit = null;
  } else {
    return null;
  }

  const startsAt = parseDate(rawPromotion.startsAt);
  const endsAt = parseDate(rawPromotion.endsAt);
  if (typeof startsAt === "undefined" || typeof endsAt === "undefined") {
    return null;
  }

  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return null;
  }

  return {
    id: id && id.length > 0 ? id : undefined,
    code,
    name,
    description,
    triggerType: (triggerType || "code") as PromotionTriggerType,
    stackMode: (stackMode || "exclusive") as PromotionStackMode,
    priority,
    scope: {
      sports,
      categories,
      productIds,
    },
    discountType: discountType as PromotionDiscountType,
    discountValue,
    minSubtotalCents,
    maxDiscountCents,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    isActive,
    usageLimit,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminForApi("admin:promotions:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status = promotionStatusSet.has(statusParam as AdminPromotionStatusFilter)
      ? (statusParam as AdminPromotionStatusFilter)
      : "all";

    const triggerTypeParam = searchParams.get("triggerType");
    const triggerType: PromotionTriggerType | "all" =
      triggerTypeParam === "code" || triggerTypeParam === "automatic"
        ? (triggerTypeParam as PromotionTriggerType)
        : "all";

    const stackModeParam = searchParams.get("stackMode");
    const stackMode: PromotionStackMode | "all" =
      stackModeParam === "stackable" || stackModeParam === "exclusive"
        ? (stackModeParam as PromotionStackMode)
        : "all";

    const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100_000);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 24, 1, 100);
    const query = searchParams.get("q") || "";

    const result = await getAdminPromotionsPage({
      q: query,
      status,
      triggerType,
      stackMode,
      page,
      pageSize,
    });

    return NextResponse.json(
      {
        promotions: result.promotions.map((promotion) => serializePromotion(promotion)),
        pagination: result.pagination,
        stats: result.stats,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load promotions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminForApi("admin:promotions:write");
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
    scope: "admin:promotions:post",
    limit: 40,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = parsePromotionPayload(payload);
    if (!parsed) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "promotion.upsert",
        resourceType: "promotion",
        status: "failure",
        message: "Invalid promotion payload.",
        request,
      });
      return NextResponse.json(
        { error: "Invalid promotion payload." },
        { status: 400 },
      );
    }

    const promotion = await upsertPromotion({
      ...parsed,
      startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
      endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
    });

    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "promotion.upsert",
      resourceType: "promotion",
      resourceId: promotion.id,
      status: "success",
      message: "Promotion upserted.",
      request,
    });

    return NextResponse.json(
      {
        success: true,
        promotion: serializePromotion(promotion),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save promotion.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "promotion.upsert",
      resourceType: "promotion",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminForApi("admin:promotions:write");
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
    scope: "admin:promotions:delete",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = parseDeletePayload(payload);
    if (!parsed) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "promotion.delete",
        resourceType: "promotion",
        status: "failure",
        message: "Invalid delete payload.",
        request,
      });
      return NextResponse.json(
        { error: "Invalid delete payload." },
        { status: 400 },
      );
    }

    await deletePromotionById(parsed.id);
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "promotion.delete",
      resourceType: "promotion",
      resourceId: parsed.id,
      status: "success",
      message: "Promotion deleted.",
      request,
    });
    return NextResponse.json(
      { success: true },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete promotion.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "promotion.delete",
      resourceType: "promotion",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
