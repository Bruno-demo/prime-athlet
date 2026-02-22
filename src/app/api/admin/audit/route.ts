import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { AdminAuditStatus, getAdminAuditEventsPage } from "@/lib/admin-audit";

export const runtime = "nodejs";

const statusSet = new Set<AdminAuditStatus | "all">([
  "all",
  "success",
  "failure",
  "denied",
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

export async function GET(request: Request) {
  const auth = await requireAdminForApi("admin:security:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100_000);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 1, 100);
    const statusParam = searchParams.get("status") || "all";
    const status = statusSet.has(statusParam as AdminAuditStatus | "all")
      ? (statusParam as AdminAuditStatus | "all")
      : "all";

    const result = await getAdminAuditEventsPage({
      page,
      pageSize,
      q: searchParams.get("q") || "",
      action: searchParams.get("action") || "all",
      resourceType: searchParams.get("resourceType") || "all",
      status,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load audit logs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
