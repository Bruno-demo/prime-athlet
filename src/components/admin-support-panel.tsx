"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleHelp,
  LoaderCircle,
  MessageSquareText,
  RefreshCcw,
  Save,
  Search,
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

interface AdminSupportTicket {
  id: string;
  code: string;
  userId: string | null;
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

interface AdminSupportResponse {
  tickets?: AdminSupportTicket[];
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

interface AdminSupportMutationResponse {
  success?: boolean;
  changed?: boolean;
  ticket?: AdminSupportTicket;
  error?: string;
}

interface AdminCsrfResponse {
  token?: string;
  permissions?: string[];
  error?: string;
}

interface AdminSupportPanelProps {
  canWriteByRole: boolean;
}

const pageSizeOptions = [10, 20, 40, 80];

const statusLabels: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  awaiting_customer: "Awaiting Customer",
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

function formatDateTime(iso: string): string {
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

function statusToneClass(status: SupportTicketStatus): string {
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

function priorityToneClass(priority: SupportTicketPriority): string {
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

export function AdminSupportPanel({ canWriteByRole }: AdminSupportPanelProps) {
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [statusOptions, setStatusOptions] = useState<SupportTicketStatus[]>([
    "open",
    "in_progress",
    "awaiting_customer",
    "resolved",
    "closed",
  ]);
  const [priorityOptions, setPriorityOptions] = useState<
    SupportTicketPriority[]
  >(["low", "normal", "high", "urgent"]);
  const [categoryOptions, setCategoryOptions] = useState<
    SupportTicketCategory[]
  >(["order", "payment", "account", "technical", "return", "other"]);

  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "all">(
    "all",
  );
  const [priorityFilter, setPriorityFilter] = useState<
    SupportTicketPriority | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<
    SupportTicketCategory | "all"
  >("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<SupportTicketStatus>("open");
  const [draftPriority, setDraftPriority] =
    useState<SupportTicketPriority>("normal");
  const [draftNote, setDraftNote] = useState("");

  const [csrfToken, setCsrfToken] = useState("");
  const [canWrite, setCanWrite] = useState(canWriteByRole);
  const [isLoading, setIsLoading] = useState(true);
  const [isSecurityLoading, setIsSecurityLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setQuery(queryDraft.trim());
      setPage(1);
    }, 260);
    return () => window.clearTimeout(timeoutId);
  }, [queryDraft]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  const loadSecurity = useCallback(async () => {
    setIsSecurityLoading(true);
    try {
      const response = await fetch("/api/admin/csrf", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as AdminCsrfResponse;
      if (!response.ok || !body.token) {
        throw new Error(body.error || "Unable to initialize admin security.");
      }
      setCsrfToken(body.token);
      const hasWritePermission = (body.permissions || []).includes(
        "admin:orders:write",
      );
      setCanWrite(canWriteByRole && hasWritePermission);
    } catch (error) {
      setCanWrite(false);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to initialize admin security.",
      );
    } finally {
      setIsSecurityLoading(false);
    }
  }, [canWriteByRole]);

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (query) {
        params.set("q", query);
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (priorityFilter !== "all") {
        params.set("priority", priorityFilter);
      }
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }

      const response = await fetch(`/api/admin/support?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as AdminSupportResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load support tickets.");
      }

      setTickets(body.tickets || []);
      setPagination({
        page: body.pagination?.page ?? page,
        pageSize: body.pagination?.pageSize ?? pageSize,
        total: body.pagination?.total ?? 0,
        totalPages: body.pagination?.totalPages ?? 1,
      });
      if (body.filters?.statuses?.length) {
        setStatusOptions(body.filters.statuses);
      }
      if (body.filters?.priorities?.length) {
        setPriorityOptions(body.filters.priorities);
      }
      if (body.filters?.categories?.length) {
        setCategoryOptions(body.filters.categories);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load support tickets.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, page, pageSize, priorityFilter, query, statusFilter]);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedTicket) {
      return;
    }
    setDraftStatus(selectedTicket.status);
    setDraftPriority(selectedTicket.priority);
    setDraftNote(selectedTicket.adminNote || "");
  }, [selectedTicket]);

  async function handleSaveSelectedTicket() {
    if (!selectedTicket) {
      return;
    }
    if (!canWrite) {
      setErrorMessage("Your role is read-only for support ticket updates.");
      return;
    }
    if (!csrfToken) {
      setErrorMessage(
        "Security token is still initializing. Retry in a moment.",
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          status: draftStatus,
          priority: draftPriority,
          adminNote: draftNote.trim() ? draftNote.trim() : null,
        }),
      });
      const body = (await response.json()) as AdminSupportMutationResponse;
      if (!response.ok || !body.ticket) {
        throw new Error(body.error || "Unable to update support ticket.");
      }

      setNotice(
        body.changed
          ? `Ticket ${body.ticket.code} updated.`
          : `Ticket ${body.ticket.code} already had the same values.`,
      );
      await loadTickets();
      setSelectedTicketId(body.ticket.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update support ticket.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const summaryLabel = useMemo(() => {
    if (pagination.total === 0) {
      return "No tickets";
    }
    return `${pagination.total.toLocaleString()} tickets`;
  }, [pagination.total]);

  return (
    <section className="space-y-4">
      <article className="glass-card rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
            <CircleHelp className="h-5 w-5 text-accent" />
            Support Queue
          </h2>
          <button
            type="button"
            onClick={() => {
              void Promise.all([loadTickets(), loadSecurity()]);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
            title="Refresh support queue"
          >
            <RefreshCcw
              className={`h-4 w-4 ${isLoading || isSecurityLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        <p className="mt-2 text-sm text-muted">
          Manage customer support tickets, update status and priority, and leave
          resolution notes.
        </p>

        {notice ? (
          <p className="mt-3 status-success rounded-xl px-3 py-2 text-sm">
            {notice}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 status-error rounded-xl px-3 py-2 text-sm">
            {errorMessage}
          </p>
        ) : null}
        {!canWrite ? (
          <p className="mt-3 status-info rounded-xl px-3 py-2 text-sm">
            Read-only mode: your current role can view support tickets but
            cannot update them.
          </p>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto]">
          <label className="inline-flex items-center gap-2 rounded-xl border border-brand/15 bg-surface px-3">
            <Search className="h-4 w-4 text-muted" />
            <input
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              className="h-10 w-full border-0 bg-transparent text-sm text-brand placeholder:text-muted focus:outline-none"
              placeholder="Search code, customer, subject, message"
              title="Search support tickets"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(
                event.target.value as SupportTicketStatus | "all",
              );
              setPage(1);
            }}
            className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
            title="Filter by status"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => (
              <option key={`admin-support-status-${status}`} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => {
              setPriorityFilter(
                event.target.value as SupportTicketPriority | "all",
              );
              setPage(1);
            }}
            className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
            title="Filter by priority"
          >
            <option value="all">All priorities</option>
            {priorityOptions.map((priority) => (
              <option
                key={`admin-support-priority-${priority}`}
                value={priority}
              >
                {priority}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(
                event.target.value as SupportTicketCategory | "all",
              );
              setPage(1);
            }}
            className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
            title="Filter by category"
          >
            <option value="all">All categories</option>
            {categoryOptions.map((category) => (
              <option
                key={`admin-support-category-${category}`}
                value={category}
              >
                {categoryLabels[category]}
              </option>
            ))}
          </select>
          <select
            value={String(pageSize)}
            onChange={(event) => {
              setPageSize(Number(event.target.value) || 20);
              setPage(1);
            }}
            className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
            title="Set page size"
          >
            {pageSizeOptions.map((size) => (
              <option key={`admin-support-page-size-${size}`} value={size}>
                {size}/page
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="rounded-full bg-brand/8 px-3 py-1 text-brand">
            {summaryLabel}
          </span>
          <span>
            Page {pagination.page}/{pagination.totalPages}
          </span>
        </div>

        {isLoading ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading support queue...
          </p>
        ) : tickets.length === 0 ? (
          <p className="mt-4 rounded-xl border border-brand/15 bg-surface px-4 py-5 text-sm text-muted">
            No tickets match current filters.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-2.5 md:hidden">
              {tickets.map((ticket) => {
                const isSelected = selectedTicketId === ticket.id;
                return (
                  <article
                    key={`admin-support-mobile-${ticket.id}`}
                    className={`rounded-2xl border p-3 ${
                      isSelected
                        ? "border-[var(--brand-action)] bg-[color-mix(in_oklab,var(--brand-action)_10%,transparent)]"
                        : "border-brand/15 bg-surface"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-muted">
                          {ticket.code}
                        </p>
                        <p className="line-clamp-2 text-sm font-semibold text-brand">
                          {ticket.subject}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-semibold transition ${
                          isSelected ? "btn-primary" : "btn-secondary"
                        }`}
                        title="Edit support ticket"
                      >
                        {isSelected ? "Selected" : "Edit"}
                      </button>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">
                      {ticket.message}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-semibold uppercase tracking-[0.08em] ${statusToneClass(ticket.status)}`}
                      >
                        {statusLabels[ticket.status]}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-semibold uppercase tracking-[0.08em] ${priorityToneClass(ticket.priority)}`}
                      >
                        {ticket.priority}
                      </span>
                      <span className="rounded-full border border-brand/15 bg-surface-soft px-2 py-0.5 text-muted">
                        {categoryLabels[ticket.category]}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      {ticket.customerName} - {ticket.customerEmail}
                    </p>
                    <p className="text-[11px] text-muted">
                      Updated {formatDateTime(ticket.updatedAt)}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="admin-table-wrap admin-table-mobile mt-4 hidden md:block">
              <table className="admin-table admin-table-pin-first admin-table-pin-last text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th className="min-w-[8.8rem]">Ticket</th>
                    <th className="min-w-[12rem]">Customer</th>
                    <th className="min-w-[14rem]">Issue</th>
                    <th className="w-[7.5rem]">Status</th>
                    <th className="w-[6.2rem]">Priority</th>
                    <th className="hidden w-[10rem] xl:table-cell">Updated</th>
                    <th className="w-[6.8rem] text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const isSelected = selectedTicketId === ticket.id;
                    return (
                      <tr
                        key={ticket.id}
                        className={
                          isSelected
                            ? "bg-[color-mix(in_oklab,var(--brand-action)_10%,transparent)]"
                            : undefined
                        }
                      >
                        <td className="align-top">
                          <p className="font-mono text-[11px] text-muted">
                            {ticket.code}
                          </p>
                          <p className="line-clamp-1 font-semibold text-brand">
                            {ticket.orderReference || "-"}
                          </p>
                        </td>
                        <td className="align-top">
                          <p className="line-clamp-1 font-semibold text-brand">
                            {ticket.customerName}
                          </p>
                          <p className="line-clamp-1 break-all text-[11px] text-muted">
                            {ticket.customerEmail}
                          </p>
                        </td>
                        <td className="align-top">
                          <p className="line-clamp-1 font-semibold text-brand">
                            {ticket.subject}
                          </p>
                          <p className="line-clamp-2 break-words text-[11px] text-muted">
                            {ticket.message}
                          </p>
                        </td>
                        <td className="align-top">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusToneClass(ticket.status)}`}
                          >
                            {statusLabels[ticket.status]}
                          </span>
                        </td>
                        <td className="align-top">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${priorityToneClass(ticket.priority)}`}
                          >
                            {ticket.priority}
                          </span>
                        </td>
                        <td className="hidden align-top xl:table-cell">
                          {formatDateTime(ticket.updatedAt)}
                        </td>
                        <td className="align-top text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-semibold transition ${
                              isSelected ? "btn-primary" : "btn-secondary"
                            }`}
                            title="Edit support ticket"
                          >
                            {isSelected ? "Selected" : "Edit"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {pagination.totalPages > 1 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={pagination.page <= 1 || isLoading}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold btn-secondary disabled:opacity-60"
              title="Previous page"
            >
              Previous
            </button>
            <p className="text-sm text-muted">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <button
              type="button"
              onClick={() =>
                setPage((current) =>
                  Math.min(pagination.totalPages, current + 1),
                )
              }
              disabled={pagination.page >= pagination.totalPages || isLoading}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold btn-secondary disabled:opacity-60"
              title="Next page"
            >
              Next
            </button>
          </div>
        ) : null}
      </article>

      <article className="glass-card rounded-3xl p-5 sm:p-6">
        <h3 className="inline-flex items-center gap-2 text-xl font-semibold text-brand">
          <MessageSquareText className="h-5 w-5 text-accent" />
          Ticket Editor
        </h3>
        {!selectedTicket ? (
          <p className="mt-3 rounded-xl border border-brand/15 bg-surface px-4 py-4 text-sm text-muted">
            Select a ticket from the queue to update status, priority, and admin
            note.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-brand/15 bg-surface-soft p-3">
              <p className="font-mono text-[11px] text-muted">
                {selectedTicket.code}
              </p>
              <p className="mt-1 text-sm font-semibold text-brand">
                {selectedTicket.subject}
              </p>
              <p className="mt-1 text-xs text-muted">
                {selectedTicket.customerName} - {selectedTicket.customerEmail}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Status
                </span>
                <select
                  value={draftStatus}
                  onChange={(event) =>
                    setDraftStatus(event.target.value as SupportTicketStatus)
                  }
                  className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                  title="Update support ticket status"
                >
                  {statusOptions.map((status) => (
                    <option key={`editor-status-${status}`} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Priority
                </span>
                <select
                  value={draftPriority}
                  onChange={(event) =>
                    setDraftPriority(
                      event.target.value as SupportTicketPriority,
                    )
                  }
                  className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                  title="Update support ticket priority"
                >
                  {priorityOptions.map((priority) => (
                    <option
                      key={`editor-priority-${priority}`}
                      value={priority}
                    >
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Admin Note
              </span>
              <textarea
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                className="themed-input min-h-24 w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                placeholder="Add internal or customer-facing note for this ticket."
                title="Support resolution note"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSaving || !canWrite || isSecurityLoading}
                onClick={() => {
                  void handleSaveSelectedTicket();
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-60"
                title="Save support ticket changes"
              >
                {isSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedTicket) {
                    return;
                  }
                  setDraftStatus(selectedTicket.status);
                  setDraftPriority(selectedTicket.priority);
                  setDraftNote(selectedTicket.adminNote || "");
                }}
                className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold btn-secondary"
                title="Reset editor changes"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
