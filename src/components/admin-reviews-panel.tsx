"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  MessageSquareQuote,
  RefreshCcw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
type ReviewStatus = "approved" | "hidden";
type ModerationAction = "approve" | "hide" | "delete";
interface AdminReviewRow {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  productId: string;
  productName: string;
  sport: string;
  rating: number;
  title: string;
  comment: string;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}
interface AdminReviewsResponse {
  reviews?: AdminReviewRow[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters?: { statuses?: ReviewStatus[]; productIds?: string[] };
  error?: string;
}
interface AdminModerationResponse {
  success?: boolean;
  moderation?: {
    action: ModerationAction;
    deleted: boolean;
    changed: boolean;
    review: AdminReviewRow | null;
  };
  error?: string;
}
interface AdminReviewsPanelProps {
  csrfToken: string;
  canWrite: boolean;
  onAfterMutation?: () => Promise<void> | void;
}
const pageSizeOptions = [10, 20, 50];
const statusFilterOptions: Array<{
  value: "all" | ReviewStatus;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "hidden", label: "Hidden" },
];
const reviewDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
function formatReviewDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }
  return reviewDateFormatter.format(parsed);
}
export function AdminReviewsPanel({
  csrfToken,
  canWrite,
  onAfterMutation,
}: AdminReviewsPanelProps) {
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewStatus>("all");
  const [productIdFilter, setProductIdFilter] = useState("");
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [mutatingReviewId, setMutatingReviewId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setQuery(queryDraft.trim());
      setPage(1);
    }, 260);
    return () => window.clearTimeout(timeoutId);
  }, [queryDraft]);
  const loadReviews = useCallback(async () => {
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
      if (productIdFilter) {
        params.set("productId", productIdFilter);
      }
      const response = await fetch(`/api/admin/reviews?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as AdminReviewsResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load reviews.");
      }
      setReviews(body.reviews || []);
      setPagination({
        page: body.pagination?.page ?? page,
        pageSize: body.pagination?.pageSize ?? pageSize,
        total: body.pagination?.total ?? 0,
        totalPages: body.pagination?.totalPages ?? 1,
      });
      setProductOptions(body.filters?.productIds || []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load reviews.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, productIdFilter, query, statusFilter]);
  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);
  const summaryLabel = useMemo(() => {
    if (pagination.total === 0) {
      return "No reviews";
    }
    return `${pagination.total.toLocaleString()} reviews`;
  }, [pagination.total]);
  async function moderateReview(
    action: ModerationAction,
    review: AdminReviewRow,
  ) {
    if (!canWrite) {
      setErrorMessage("Your role is read-only for review moderation.");
      return;
    }
    if (!csrfToken) {
      setErrorMessage(
        "Security token is initializing. Please retry in a moment.",
      );
      return;
    }
    if (action === "delete") {
      const confirmed = window.confirm(
        `Delete review "${review.title}" from ${review.userDisplayName}? This cannot be undone.`,
      );
      if (!confirmed) {
        return;
      }
    }
    setErrorMessage(null);
    setNotice(null);
    setMutatingReviewId(review.id);
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ action, reviewId: review.id }),
      });
      const body = (await response.json()) as AdminModerationResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to moderate review.");
      }
      setNotice(
        action === "delete"
          ? "Review deleted."
          : action === "hide"
            ? "Review hidden from storefront."
            : "Review approved for storefront visibility.",
      );
      await loadReviews();
      await onAfterMutation?.();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to moderate review.",
      );
    } finally {
      setMutatingReviewId(null);
    }
  }
  return (
    <article className="glass-card rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
          <MessageSquareQuote className="h-5 w-5 text-accent" /> Review
          Moderation
        </h3>
        <button
          type="button"
          onClick={() => {
            void loadReviews();
          }}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
          title="Reload moderation reviews"
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">
        Approve, hide, or delete user reviews. Hidden reviews are excluded from
        public product rating/review aggregates.
      </p>
      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto]">
        <label className="inline-flex items-center gap-2 rounded-xl border border-brand/15 bg-surface px-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            className="h-10 w-full border-0 bg-transparent text-sm text-brand placeholder:text-muted focus:outline-none"
            placeholder="Search user, product, title, or text"
            title="Search reviews"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as "all" | ReviewStatus);
            setPage(1);
          }}
          className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
          title="Filter reviews by moderation status"
        >
          {statusFilterOptions.map((option) => (
            <option key={`review-status-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={productIdFilter}
          onChange={(event) => {
            setProductIdFilter(event.target.value);
            setPage(1);
          }}
          className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
          title="Filter reviews by product"
        >
          <option value="">All products</option>
          {productOptions.map((productId) => (
            <option
              key={`review-product-filter-${productId}`}
              value={productId}
            >
              {productId}
            </option>
          ))}
        </select>
        <select
          value={pageSize}
          onChange={(event) => {
            const nextPageSize = Number(event.target.value) || 20;
            setPageSize(nextPageSize);
            setPage(1);
          }}
          className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
          title="Set moderation page size"
        >
          {pageSizeOptions.map((option) => (
            <option key={`review-page-size-${option}`} value={option}>
              {option}/page
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
      {errorMessage ? (
        <p className="mt-3 text-sm text-[var(--status-error-text)]">
          {errorMessage}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 text-sm text-[var(--status-success-text)]">
          {notice}
        </p>
      ) : null}
      {isLoading ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading reviews...
        </p>
      ) : reviews.length === 0 ? (
        <p className="mt-4 rounded-xl border border-brand/15 bg-surface px-4 py-5 text-sm text-muted">
          No reviews match your filters.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-2.5 md:hidden">
            {reviews.map((review) => {
              const isMutating = mutatingReviewId === review.id;
              return (
                <article
                  key={`review-mobile-${review.id}`}
                  className="rounded-2xl border border-brand/15 bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand">
                        {review.productName}
                      </p>
                      <p className="font-mono text-[10px] text-muted">
                        {review.productId}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand/8 px-2 py-0.5 text-[11px] font-semibold text-brand">
                      <Star className="h-3.5 w-3.5 fill-current text-accent" />
                      {review.rating.toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-brand">
                    {review.title}
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs text-muted">
                    {review.comment}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 font-semibold uppercase tracking-[0.08em] ${review.status === "approved" ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)]" : "bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"}`}
                    >
                      {review.status}
                    </span>
                    <span className="rounded-full border border-brand/15 bg-surface-soft px-2 py-0.5 text-muted">
                      {formatReviewDate(review.createdAt)}
                    </span>
                    <span className="truncate text-muted">
                      {review.userDisplayName}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        void moderateReview("approve", review);
                      }}
                      disabled={isMutating || !canWrite}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold btn-secondary disabled:opacity-60"
                      title="Approve this review for storefront visibility"
                    >
                      {isMutating ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void moderateReview("hide", review);
                      }}
                      disabled={isMutating || !canWrite}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold btn-secondary disabled:opacity-60"
                      title="Hide this review from storefront"
                    >
                      {isMutating ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                      <span>Hide</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void moderateReview("delete", review);
                      }}
                      disabled={isMutating || !canWrite}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold btn-danger disabled:opacity-60"
                      title="Delete this review permanently"
                    >
                      {isMutating ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span>Delete</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="admin-table-wrap admin-table-mobile mt-4 hidden md:block">
            <table className="admin-table admin-table-pin-first admin-table-pin-last text-xs sm:text-sm">
              <thead>
                <tr>
                  <th className="min-w-[13rem]">Product</th>
                  <th className="hidden min-w-[12rem] 2xl:table-cell">
                    Reviewer
                  </th>
                  <th className="min-w-[14rem]">Review</th>
                  <th className="w-[6.5rem] text-right">Rating</th>
                  <th className="w-[8rem]">Status</th>
                  <th className="hidden w-[8.5rem] xl:table-cell">Date</th>
                  <th className="w-[8.75rem] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => {
                  const isMutating = mutatingReviewId === review.id;
                  return (
                    <tr key={review.id}>
                      <td className="align-top">
                        <p className="line-clamp-2 break-words font-semibold text-brand">
                          {review.productName}
                        </p>
                        <p className="mt-1 line-clamp-1 break-all font-mono text-[11px] text-muted">
                          {review.productId}
                        </p>
                      </td>
                      <td className="hidden align-top 2xl:table-cell">
                        <p className="line-clamp-1 font-semibold text-brand">
                          {review.userDisplayName}
                        </p>
                        <p className="mt-1 line-clamp-1 break-all text-[11px] text-muted">
                          {review.userEmail}
                        </p>
                      </td>
                      <td className="align-top">
                        <p className="line-clamp-1 font-semibold text-brand">
                          {review.title}
                        </p>
                        <p className="mt-1 line-clamp-2 break-words text-[11px] text-muted">
                          {review.comment}
                        </p>
                      </td>
                      <td className="align-top text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand/8 px-2.5 py-0.5 font-semibold text-brand">
                          <Star className="h-3.5 w-3.5 fill-current text-accent" />
                          {review.rating.toFixed(1)}
                        </span>
                      </td>
                      <td className="align-top">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${review.status === "approved" ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)]" : "bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"}`}
                        >
                          {review.status}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap align-top xl:table-cell">
                        {formatReviewDate(review.createdAt)}
                      </td>
                      <td className="align-top text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              void moderateReview("approve", review);
                            }}
                            disabled={isMutating || !canWrite}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-semibold btn-secondary disabled:opacity-60"
                            title="Approve this review for storefront visibility"
                            aria-label={`Approve review ${review.title}`}
                          >
                            {isMutating ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void moderateReview("hide", review);
                            }}
                            disabled={isMutating || !canWrite}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-semibold btn-secondary disabled:opacity-60"
                            title="Hide this review from storefront"
                            aria-label={`Hide review ${review.title}`}
                          >
                            {isMutating ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void moderateReview("delete", review);
                            }}
                            disabled={isMutating || !canWrite}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-semibold btn-danger disabled:opacity-60"
                            title="Delete this review permanently"
                            aria-label={`Delete review ${review.title}`}
                          >
                            {isMutating ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
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
            disabled={pagination.page <= 1}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold btn-secondary disabled:opacity-50"
            title="Previous moderation page"
          >
            Prev
          </button>
          <p className="text-sm text-muted">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(pagination.totalPages, current + 1))
            }
            disabled={pagination.page >= pagination.totalPages}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold btn-secondary disabled:opacity-50"
            title="Next moderation page"
          >
            Next
          </button>
        </div>
      ) : null}
    </article>
  );
}
