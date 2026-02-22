import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import {
  enforceAdminMutationRateLimit,
  requireAdminCsrf,
} from "@/lib/admin-security";
import {
  getAdminSupportTicketsPage,
  parseSupportTicketCategory,
  parseSupportTicketPriority,
  parseSupportTicketStatus,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketStatus,
  updateSupportTicketByAdmin,
} from "@/lib/support-tickets-repository";

export const runtime = "nodejs";

interface UpdateTicketPayload {
  ticketId: string;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  adminNote?: string | null;
}

function jsonNoStore(data: unknown, init?: Omit<ResponseInit, "headers">): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
    },
  });
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

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function parseUpdatePayload(payload: unknown): UpdateTicketPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const ticketId = normalizeText(body.ticketId, 120);
  if (!ticketId) {
    return null;
  }

  const nextStatus = parseSupportTicketStatus(
    typeof body.status === "string" ? body.status : null,
  );
  const nextPriority = parseSupportTicketPriority(
    typeof body.priority === "string" ? body.priority : null,
  );
  const adminNote =
    body.adminNote === null
      ? null
      : typeof body.adminNote === "string"
        ? body.adminNote
        : undefined;

  const hasStatus = typeof body.status === "string";
  const hasPriority = typeof body.priority === "string";
  const hasNote = body.adminNote === null || typeof body.adminNote === "string";

  if ((hasStatus && !nextStatus) || (hasPriority && !nextPriority)) {
    return null;
  }

  if (!hasStatus && !hasPriority && !hasNote) {
    return null;
  }

  return {
    ticketId,
    status: nextStatus || undefined,
    priority: nextPriority || undefined,
    adminNote,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminForApi("admin:orders:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100_000);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 1, 100);
    const q = normalizeText(searchParams.get("q"), 200);
    const status = parseSupportTicketStatus(searchParams.get("status")) || "all";
    const priority = parseSupportTicketPriority(searchParams.get("priority")) || "all";
    const category =
      (parseSupportTicketCategory(searchParams.get("category")) as
        | SupportTicketCategory
        | null) || "all";

    const pageData = await getAdminSupportTicketsPage({
      page,
      pageSize,
      q,
      status,
      priority,
      category,
    });

    return jsonNoStore(pageData);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load support tickets.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminForApi("admin:orders:write");
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
    scope: "admin:support:post",
    limit: 45,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const parsed = parseUpdatePayload(await request.json());
    if (!parsed) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "support.update",
        resourceType: "support_ticket",
        status: "failure",
        message: "Invalid support ticket update payload.",
        request,
      });
      return jsonNoStore({ error: "Invalid support ticket update payload." }, { status: 400 });
    }

    const result = await updateSupportTicketByAdmin(parsed);

    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "support.update",
      resourceType: "support_ticket",
      resourceId: parsed.ticketId,
      status: "success",
      message: result.changed
        ? "Support ticket updated."
        : "Support ticket update skipped (no change).",
      metadata: {
        changed: result.changed,
        status: result.ticket.status,
        priority: result.ticket.priority,
      },
      request,
    });

    return jsonNoStore({
      success: true,
      changed: result.changed,
      ticket: result.ticket,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update support ticket.";

    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "support.update",
      resourceType: "support_ticket",
      status: "failure",
      message,
      request,
    });

    const status = /invalid support ticket id/i.test(message)
      ? 400
      : /support ticket not found/i.test(message)
        ? 404
        : /not configured/i.test(message)
          ? 503
          : 500;

    return jsonNoStore({ error: message }, { status });
  }
}
