import { NextResponse } from "next/server";

import { getAuthenticatedUser, validateEmail } from "@/lib/auth";
import {
  createSupportTicket,
  getSupportTicketCategories,
  getSupportTicketPriorities,
  getSupportTicketStatuses,
  getSupportTicketsForUser,
  type SupportTicketCategory,
  parseSupportTicketCategory,
  parseSupportTicketStatus,
} from "@/lib/support-tickets-repository";

export const runtime = "nodejs";

interface CreateSupportTicketPayload {
  name?: string;
  email?: string;
  subject: string;
  message: string;
  category: SupportTicketCategory;
  orderReference?: string;
}

function jsonNoStore(data: unknown, init?: Omit<ResponseInit, "headers">): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function toSafeInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function parseCreatePayload(payload: unknown): CreateSupportTicketPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const subject = normalizeText(body.subject, 180);
  const message = normalizeText(body.message, 5_000);
  const category = normalizeText(body.category, 40).toLowerCase();
  const orderReference = normalizeText(body.orderReference, 120);
  const name = normalizeText(body.name, 120);
  const email = normalizeText(body.email, 320).toLowerCase();

  if (subject.length < 4 || message.length < 12) {
    return null;
  }
  const parsedCategory = parseSupportTicketCategory(category);
  if (!parsedCategory) {
    return null;
  }

  return {
    subject,
    message,
    category: parsedCategory,
    orderReference: orderReference || undefined,
    name: name || undefined,
    email: email || undefined,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const { searchParams } = new URL(request.url);
    const page = toSafeInt(searchParams.get("page"), 1, 1, 100_000);
    const pageSize = toSafeInt(searchParams.get("pageSize"), 10, 1, 50);
    const q = normalizeText(searchParams.get("q"), 200);
    const statusParam = parseSupportTicketStatus(searchParams.get("status"));
    const status = statusParam || "all";

    if (!user) {
      return jsonNoStore({
        authenticated: false,
        user: null,
        tickets: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 1,
        },
        filters: {
          statuses: getSupportTicketStatuses(),
          priorities: getSupportTicketPriorities(),
          categories: getSupportTicketCategories(),
        },
      });
    }

    const pageData = await getSupportTicketsForUser({
      userId: user.id,
      customerEmail: user.email,
      page,
      pageSize,
      q,
      status,
    });

    return jsonNoStore({
      authenticated: true,
      user: {
        email: user.email,
        displayName: user.displayName,
      },
      ...pageData,
      filters: {
        statuses: getSupportTicketStatuses(),
        priorities: getSupportTicketPriorities(),
        categories: getSupportTicketCategories(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load support tickets.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = await request.json();
    const parsed = parseCreatePayload(payload);
    if (!parsed) {
      return jsonNoStore({ error: "Invalid support request payload." }, { status: 400 });
    }

    const customerName = user?.displayName || parsed.name || "";
    const customerEmail = user?.email || parsed.email || "";
    if (customerName.length < 2) {
      return jsonNoStore({ error: "Provide a valid name." }, { status: 400 });
    }
    if (!validateEmail(customerEmail)) {
      return jsonNoStore({ error: "Provide a valid email address." }, { status: 400 });
    }

    const ticket = await createSupportTicket({
      userId: user?.id || null,
      customerEmail,
      customerName,
      subject: parsed.subject,
      message: parsed.message,
      category: parsed.category,
      orderReference: parsed.orderReference || null,
    });

    return jsonNoStore(
      {
        success: true,
        ticket,
        message:
          "Support request submitted. Our team will review your ticket shortly.",
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to submit support request.";
    const status = /not configured/i.test(message) ? 503 : 500;
    return jsonNoStore({ error: message }, { status });
  }
}
