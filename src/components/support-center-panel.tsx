"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleHelp,
  LoaderCircle,
  Mail,
  MessageSquareText,
  RefreshCcw,
  Send,
  Ticket,
  UserRound,
} from "lucide-react";

type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "awaiting_customer"
  | "resolved"
  | "closed";
type SupportTicketPriority = "low" | "normal" | "high" | "urgent";
type SupportTicketCategory =
  | "order"
  | "payment"
  | "account"
  | "technical"
  | "return"
  | "other";

interface SupportTicketRow {
  id: string;
  code: string;
  customerEmail: string;
  customerName: string;
  subject: string;
  message: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  orderReference: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

interface SupportTicketsResponse {
  authenticated?: boolean;
  user?: {
    email: string;
    displayName: string;
  } | null;
  tickets?: SupportTicketRow[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters?: {
    statuses?: SupportTicketStatus[];
    priorities?: SupportTicketPriority[];
    categories?: SupportTicketCategory[];
  };
  error?: string;
}

interface SupportCreateResponse {
  success?: boolean;
  ticket?: SupportTicketRow;
  message?: string;
  error?: string;
}

const statusLabels: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  awaiting_customer: "Awaiting You",
  resolved: "Resolved",
  closed: "Closed",
};

const categoryLabels: Record<SupportTicketCategory, string> = {
  order: "Order",
  payment: "Payment",
  account: "Account",
  technical: "Technical",
  return: "Return",
  other: "Other",
};

function formatTicketDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function statusBadgeClass(status: SupportTicketStatus): string {
  if (status === "resolved" || status === "closed") {
    return "status-success";
  }
  if (status === "awaiting_customer") {
    return "status-awaiting";
  }
  if (status === "in_progress") {
    return "status-info";
  }
  return "status-warning";
}

function priorityBadgeClass(priority: SupportTicketPriority): string {
  if (priority === "urgent") {
    return "status-error";
  }
  if (priority === "high") {
    return "status-warning";
  }
  if (priority === "normal") {
    return "status-info";
  }
  return "status-success";
}

export function SupportCenterPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory>("order");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [orderReference, setOrderReference] = useState("");

  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "all">(
    "all",
  );
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 8,
    total: 0,
    totalPages: 1,
  });
  const [categories, setCategories] = useState<SupportTicketCategory[]>([
    "order",
    "payment",
    "account",
    "technical",
    "return",
    "other",
  ]);
  const [statuses, setStatuses] = useState<SupportTicketStatus[]>([
    "open",
    "in_progress",
    "awaiting_customer",
    "resolved",
    "closed",
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setQuery(queryDraft.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(timeoutId);
  }, [queryDraft]);

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (query) {
        params.set("q", query);
      }

      const response = await fetch(
        `/api/support/tickets?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      const body = (await response.json()) as SupportTicketsResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load support center.");
      }

      const authenticated = Boolean(body.authenticated);
      setIsAuthenticated(authenticated);
      setTickets(body.tickets || []);
      setPagination({
        page: body.pagination?.page ?? page,
        pageSize: body.pagination?.pageSize ?? pageSize,
        total: body.pagination?.total ?? 0,
        totalPages: body.pagination?.totalPages ?? 1,
      });

      if (body.user?.displayName) {
        setUserName((current) => current || body.user?.displayName || "");
      }
      if (body.user?.email) {
        setUserEmail((current) => current || body.user?.email || "");
      }
      if (body.filters?.categories?.length) {
        setCategories(body.filters.categories);
      }
      if (body.filters?.statuses?.length) {
        setStatuses(body.filters.statuses);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load support center.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, query, statusFilter]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setNotice(null);

    if (!isAuthenticated && userName.trim().length < 2) {
      setErrorMessage("Enter your name so support can identify your request.");
      return;
    }
    if (!isAuthenticated && userEmail.trim().length < 5) {
      setErrorMessage("Enter your email so support can contact you.");
      return;
    }
    if (subject.trim().length < 4) {
      setErrorMessage("Subject must be at least 4 characters.");
      return;
    }
    if (message.trim().length < 12) {
      setErrorMessage("Message must be at least 12 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: isAuthenticated ? undefined : userName.trim(),
          email: isAuthenticated ? undefined : userEmail.trim(),
          category,
          subject: subject.trim(),
          message: message.trim(),
          orderReference: orderReference.trim() || undefined,
        }),
      });
      const body = (await response.json()) as SupportCreateResponse;
      if (!response.ok || !body.ticket) {
        throw new Error(body.error || "Unable to submit support request.");
      }

      setSubject("");
      setMessage("");
      setOrderReference("");
      setNotice(
        body.message ||
          `Support request submitted. Ticket ${body.ticket.code} is now in the queue.`,
      );
      await loadTickets();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit support request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const ticketSummary = useMemo(() => {
    if (!isAuthenticated) {
      return "Sign in to track your support history and updates.";
    }
    if (pagination.total === 0) {
      return "No support tickets yet.";
    }
    return `${pagination.total.toLocaleString()} ticket(s) found.`;
  }, [isAuthenticated, pagination.total]);

  return (
    <section
      id="report-concern"
      className="glass-card scroll-mt-28 rounded-3xl p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand sm:text-3xl">
          <Ticket className="h-5 w-5 text-accent" />
          Support Ticket Center
        </h2>
        <button
          type="button"
          onClick={() => {
            void loadTickets();
          }}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
          title="Refresh support tickets"
        >
          <RefreshCcw
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <p className="mt-2 text-sm text-muted">
        Open a support request for order, payment, account, or technical issues.
        Each request gets a trackable ticket code.
      </p>

      {notice ? (
        <p className="mt-4 status-success rounded-xl px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-4 status-error rounded-xl px-3 py-2 text-sm">
          {errorMessage}
        </p>
      ) : null}

      <form className="mt-5 grid gap-3" onSubmit={handleSubmit}>
        {!isAuthenticated ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                <UserRound className="h-3.5 w-3.5" />
                Name
              </span>
              <input
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none"
                placeholder="Your full name"
                title="Enter your full name"
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                <Mail className="h-3.5 w-3.5" />
                Email
              </span>
              <input
                value={userEmail}
                onChange={(event) => setUserEmail(event.target.value)}
                className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none"
                placeholder="you@example.com"
                title="Enter your contact email"
                type="email"
                autoComplete="email"
              />
            </label>
          </div>
        ) : (
          <p className="rounded-xl border border-brand/15 bg-surface-soft px-3 py-2 text-sm text-muted">
            Signed in as
            <span className="font-semibold text-brand">{userEmail}</span>.
            Ticket updates stay synced to your account.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <CircleHelp className="h-3.5 w-3.5" />
              Category
            </span>
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as SupportTicketCategory)
              }
              className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none"
              title="Choose support category"
            >
              {categories.map((option) => (
                <option key={`support-category-${option}`} value={option}>
                  {categoryLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <Ticket className="h-3.5 w-3.5" />
              Order Reference
            </span>
            <input
              value={orderReference}
              onChange={(event) => setOrderReference(event.target.value)}
              className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none"
              placeholder="Optional order/session id"
              title="Add order or payment reference"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            <MessageSquareText className="h-3.5 w-3.5" />
            Subject
          </span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none"
            placeholder="Example: Wrong item delivered in my order"
            title="Support ticket subject"
          />
        </label>

        <label className="block">
          <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            <MessageSquareText className="h-3.5 w-3.5" />
            Message
          </span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="themed-input min-h-28 w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
            placeholder="Describe what happened and what resolution you need."
            title="Detailed support message"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold btn-primary disabled:opacity-70"
            title="Submit support ticket"
          >
            {isSubmitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit ticket
          </button>
          {!isAuthenticated ? (
            <Link
              href="/auth/sign-in?next=%2Fsupport%23report-concern"
              className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold btn-secondary"
              title="Sign in to track support tickets"
            >
              Sign in to track tickets
            </Link>
          ) : null}
        </div>
      </form>

      <div className="mt-7 rounded-2xl border border-brand/15 bg-surface-soft p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-brand">Ticket History</h3>
          <p className="text-xs text-muted">{ticketSummary}</p>
        </div>

        {isAuthenticated ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.45fr)]">
            <input
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              placeholder="Search code, subject, message, order reference"
              title="Search your support history"
            />
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(
                  event.target.value as SupportTicketStatus | "all",
                );
                setPage(1);
              }}
              className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              title="Filter support tickets by status"
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={`support-status-${status}`} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {isLoading ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading support history...
          </p>
        ) : !isAuthenticated ? (
          <p className="mt-4 rounded-xl border border-brand/15 bg-surface px-4 py-3 text-sm text-muted">
            Sign in to view your personal support queue and resolution notes.
          </p>
        ) : tickets.length === 0 ? (
          <p className="mt-4 rounded-xl border border-brand/15 bg-surface px-4 py-3 text-sm text-muted">
            No tickets match your filters.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {tickets.map((ticket) => (
              <article
                key={ticket.id}
                className="rounded-xl border border-brand/15 bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] font-semibold text-muted">
                      {ticket.code}
                    </p>
                    <h4 className="line-clamp-2 text-sm font-semibold text-brand">
                      {ticket.subject}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusBadgeClass(ticket.status)}`}
                    >
                      {statusLabels[ticket.status]}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${priorityBadgeClass(ticket.priority)}`}
                    >
                      {ticket.priority}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">{ticket.message}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span className="rounded-full border border-brand/15 bg-surface-soft px-2 py-0.5">
                    {categoryLabels[ticket.category]}
                  </span>
                  {ticket.orderReference ? (
                    <span className="rounded-full border border-brand/15 bg-surface-soft px-2 py-0.5">
                      Ref: {ticket.orderReference}
                    </span>
                  ) : null}
                  <span>Updated {formatTicketDate(ticket.updatedAt)}</span>
                </div>
                {ticket.adminNote ? (
                  <p className="mt-3 rounded-lg border border-brand/15 bg-surface-soft px-3 py-2 text-xs text-muted">
                    <span className="font-semibold text-brand">
                      Support note:
                    </span>
                    {ticket.adminNote}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {isAuthenticated && pagination.totalPages > 1 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold btn-secondary disabled:opacity-60"
              title="Previous ticket page"
            >
              Previous
            </button>
            <p className="text-sm text-muted">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() =>
                setPage((current) =>
                  Math.min(pagination.totalPages, current + 1),
                )
              }
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold btn-secondary disabled:opacity-60"
              title="Next ticket page"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
