import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import {
  enforceAdminMutationRateLimit,
  requireAdminCsrf,
} from "@/lib/admin-security";
import {
  createTaxonomyItem,
  deleteTaxonomyItem,
  getTaxonomyItems,
  isTaxonomyType,
  renameTaxonomyItem,
  TaxonomyInUseError,
  TaxonomyType,
  TaxonomyValidationError,
} from "@/lib/taxonomy-repository";
import { revalidateStorefrontCaches } from "@/lib/storefront-cache";

export const runtime = "nodejs";

type TaxonomyMutationAction = "create" | "rename" | "delete";

interface TaxonomyMutationPayload {
  action: TaxonomyMutationAction;
  type: TaxonomyType;
  value: string;
  nextValue?: string;
}

function parsePayload(payload: unknown): TaxonomyMutationPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const action =
    typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const type = typeof body.type === "string" ? body.type.trim().toLowerCase() : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";
  const nextValue =
    typeof body.nextValue === "string" ? body.nextValue.trim() : undefined;

  if (
    (action !== "create" && action !== "rename" && action !== "delete") ||
    !isTaxonomyType(type) ||
    value.length === 0
  ) {
    return null;
  }

  return {
    action,
    type,
    value,
    nextValue,
  };
}

export async function GET() {
  const auth = await requireAdminForApi("admin:products:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const [sports, categories] = await Promise.all([
      getTaxonomyItems("sport"),
      getTaxonomyItems("category"),
    ]);

    return NextResponse.json(
      {
        sports,
        categories,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load taxonomy.";
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
    scope: "admin:taxonomy:post",
    limit: 35,
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
        action: "taxonomy.mutate",
        resourceType: "taxonomy",
        status: "failure",
        message: "Invalid taxonomy payload.",
        request,
      });
      return NextResponse.json({ error: "Invalid taxonomy payload." }, { status: 400 });
    }

    if (parsed.action === "create") {
      const item = await createTaxonomyItem({
        type: parsed.type,
        value: parsed.value,
      });
      revalidateStorefrontCaches();
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: `taxonomy.${parsed.type}.create`,
        resourceType: "taxonomy",
        resourceId: item.value,
        status: "success",
        message: "Taxonomy item created.",
        request,
      });
      return NextResponse.json({ success: true, item });
    }

    if (parsed.action === "rename") {
      if (!parsed.nextValue || parsed.nextValue.trim().length === 0) {
        return NextResponse.json({ error: "nextValue is required for rename." }, { status: 400 });
      }

      const result = await renameTaxonomyItem({
        type: parsed.type,
        value: parsed.value,
        nextValue: parsed.nextValue,
      });
      revalidateStorefrontCaches();

      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: `taxonomy.${parsed.type}.rename`,
        resourceType: "taxonomy",
        resourceId: parsed.value,
        status: "success",
        message: `Renamed "${parsed.value}" to "${parsed.nextValue}".`,
        metadata: {
          renamedProducts: result.renamedProducts,
        },
        request,
      });

      return NextResponse.json({
        success: true,
        item: result.item,
        renamedProducts: result.renamedProducts,
      });
    }

    const deleted = await deleteTaxonomyItem({
      type: parsed.type,
      value: parsed.value,
    });
    revalidateStorefrontCaches();
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: `taxonomy.${parsed.type}.delete`,
      resourceType: "taxonomy",
      resourceId: parsed.value,
      status: "success",
      message: deleted.deleted ? "Taxonomy item deleted." : "Taxonomy item not found.",
      request,
    });
    return NextResponse.json({
      success: true,
      deleted: deleted.deleted,
    });
  } catch (error) {
    if (error instanceof TaxonomyValidationError) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "taxonomy.mutate",
        resourceType: "taxonomy",
        status: "failure",
        message: error.message,
        request,
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof TaxonomyInUseError) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "taxonomy.mutate",
        resourceType: "taxonomy",
        status: "failure",
        message: error.message,
        metadata: {
          usageCount: error.usageCount,
        },
        request,
      });
      return NextResponse.json(
        { error: error.message, usageCount: error.usageCount },
        { status: 409 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to mutate taxonomy.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "taxonomy.mutate",
      resourceType: "taxonomy",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
