"use client";
import { useCallback, useEffect, useState } from "react";
import {
  LoaderCircle,
  Megaphone,
  RefreshCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { formatPrice } from "@/lib/catalog";
type PromotionDiscountType = "percent" | "fixed";
type PromotionRuntimeStatus = "active" | "scheduled" | "expired" | "inactive";
type PromotionTriggerType = "code" | "automatic";
type PromotionStackMode = "stackable" | "exclusive";
type PromotionStatusFilter = "all" | PromotionRuntimeStatus;
interface AdminPromotionRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  triggerType: PromotionTriggerType;
  stackMode: PromotionStackMode;
  priority: number;
  scope: { sports: string[]; categories: string[]; productIds: string[] };
  discountType: PromotionDiscountType;
  discountValue: number;
  minSubtotalCents: number;
  maxDiscountCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  usageLimit: number | null;
  usageCount: number;
}
interface PromotionsResponse {
  promotions?: AdminPromotionRecord[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  stats?: {
    active: number;
    scheduled: number;
    expired: number;
    inactive: number;
  };
  error?: string;
}
interface AdminProductScopeOptionsResponse {
  sports?: string[];
  categories?: string[];
  productIds?: string[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}
interface PromotionMutationResponse {
  promotion?: AdminPromotionRecord;
  error?: string;
}
interface PromotionFormState {
  id: string | null;
  code: string;
  name: string;
  description: string;
  triggerType: PromotionTriggerType;
  stackMode: PromotionStackMode;
  priority: number;
  sportsScope: string[];
  categoriesScope: string[];
  productIdsScope: string[];
  discountType: PromotionDiscountType;
  discountValue: number;
  minSubtotalCents: number;
  maxDiscountCents: string;
  usageLimit: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}
const runtimeStatusClasses: Record<PromotionRuntimeStatus, string> = {
  active: "status-success",
  scheduled: "status-info",
  expired: "status-warning",
  inactive: "status-error",
};
const priorityOptions = [0, 10, 25, 50, 75, 100, 150, 200, 500, 1000];
const percentDiscountOptions = [5, 10, 15, 20, 25, 30, 40, 50];
const fixedDiscountOptions = [500, 1000, 1500, 2000, 2500, 5000, 7500, 10000];
const minSubtotalOptions = [0, 2500, 5000, 7500, 10000, 15000, 20000, 30000];
const maxDiscountOptions = [500, 1000, 1500, 2000, 3000, 5000, 10000];
const usageLimitOptions = [10, 25, 50, 100, 250, 500, 1000];
const promotionsPageSizeOptions = [12, 24, 36, 48, 72];
function createEmptyForm(): PromotionFormState {
  return {
    id: null,
    code: "",
    name: "",
    description: "",
    triggerType: "code",
    stackMode: "exclusive",
    priority: 100,
    sportsScope: [],
    categoriesScope: [],
    productIdsScope: [],
    discountType: "percent",
    discountValue: 10,
    minSubtotalCents: 0,
    maxDiscountCents: "",
    usageLimit: "",
    startsAt: "",
    endsAt: "",
    isActive: true,
  };
}
function toInputDate(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
function toFormState(promotion: AdminPromotionRecord): PromotionFormState {
  return {
    id: promotion.id,
    code: promotion.code,
    name: promotion.name,
    description: promotion.description,
    triggerType: promotion.triggerType,
    stackMode: promotion.stackMode,
    priority: promotion.priority,
    sportsScope: promotion.scope.sports,
    categoriesScope: promotion.scope.categories,
    productIdsScope: promotion.scope.productIds,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    minSubtotalCents: promotion.minSubtotalCents,
    maxDiscountCents:
      promotion.maxDiscountCents !== null
        ? String(promotion.maxDiscountCents)
        : "",
    usageLimit:
      promotion.usageLimit !== null ? String(promotion.usageLimit) : "",
    startsAt: toInputDate(promotion.startsAt),
    endsAt: toInputDate(promotion.endsAt),
    isActive: promotion.isActive,
  };
}
function getRuntimeStatus(
  promotion: AdminPromotionRecord,
): PromotionRuntimeStatus {
  if (!promotion.isActive) {
    return "inactive";
  }
  const now = Date.now();
  const startsAt = promotion.startsAt
    ? new Date(promotion.startsAt).getTime()
    : null;
  const endsAt = promotion.endsAt ? new Date(promotion.endsAt).getTime() : null;
  if (startsAt && startsAt > now) {
    return "scheduled";
  }
  if (endsAt && endsAt < now) {
    return "expired";
  }
  return "active";
}
export function AdminPromotionsPanel({
  revenueBaselineCents,
  csrfToken,
  canWrite,
}: {
  revenueBaselineCents: number;
  csrfToken: string;
  canWrite: boolean;
}) {
  const [promotions, setPromotions] = useState<AdminPromotionRecord[]>([]);
  const [promotionStats, setPromotionStats] = useState({
    active: 0,
    scheduled: 0,
    expired: 0,
    inactive: 0,
  });
  const [promotionPagination, setPromotionPagination] = useState({
    page: 1,
    pageSize: 24,
    total: 0,
    totalPages: 1,
  });
  const [sportScopeOptions, setSportScopeOptions] = useState<string[]>([]);
  const [categoryScopeOptions, setCategoryScopeOptions] = useState<string[]>(
    [],
  );
  const [productIdScopeOptions, setProductIdScopeOptions] = useState<string[]>(
    [],
  );
  const [form, setForm] = useState<PromotionFormState>(createEmptyForm);
  const [selectedPromotionId, setSelectedPromotionId] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<PromotionStatusFilter>("all");
  const [triggerFilter, setTriggerFilter] = useState<
    PromotionTriggerType | "all"
  >("all");
  const [stackFilter, setStackFilter] = useState<PromotionStackMode | "all">(
    "all",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadPromotions = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("status", statusFilter);
    params.set("triggerType", triggerFilter);
    params.set("stackMode", stackFilter);
    if (query.trim()) {
      params.set("q", query.trim());
    }
    const response = await fetch(`/api/admin/promotions?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    const body = (await response.json()) as PromotionsResponse;
    if (!response.ok) {
      throw new Error(body.error || "Unable to load promotions.");
    }
    setPromotions(body.promotions || []);
    setPromotionPagination({
      page: body.pagination?.page ?? page,
      pageSize: body.pagination?.pageSize ?? pageSize,
      total: body.pagination?.total ?? 0,
      totalPages: body.pagination?.totalPages ?? 1,
    });
    if (body.pagination?.page && body.pagination.page !== page) {
      setPage(body.pagination.page);
    }
    if (body.pagination?.pageSize && body.pagination.pageSize !== pageSize) {
      setPageSize(body.pagination.pageSize);
    }
    setPromotionStats({
      active: body.stats?.active ?? 0,
      scheduled: body.stats?.scheduled ?? 0,
      expired: body.stats?.expired ?? 0,
      inactive: body.stats?.inactive ?? 0,
    });
  }, [page, pageSize, query, stackFilter, statusFilter, triggerFilter]);
  const loadCatalogOptions = useCallback(async () => {
    const response = await fetch(
      "/api/admin/products?view=scope-options&page=1&pageSize=300",
      { method: "GET", cache: "no-store" },
    );
    const body = (await response.json()) as AdminProductScopeOptionsResponse;
    if (!response.ok) {
      throw new Error(body.error || "Unable to load product options.");
    }
    setSportScopeOptions(body.sports || []);
    setCategoryScopeOptions(body.categories || []);
    setProductIdScopeOptions(body.productIds || []);
  }, []);
  useEffect(() => {
    void loadCatalogOptions().catch((error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load product options.",
      );
    });
  }, [loadCatalogOptions]);
  useEffect(() => {
    setIsLoading(true);
    setErrorMessage(null);
    setNotice(null);
    void loadPromotions()
      .catch((error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load promotions.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [loadPromotions]);
  const selectedSportScope = form.sportsScope[0] || "";
  const selectedCategoryScope = form.categoriesScope[0] || "";
  const selectedProductIdScope = form.productIdsScope[0] || "";
  const resetForm = useCallback(() => {
    setForm(createEmptyForm());
    setSelectedPromotionId(null);
    setErrorMessage(null);
    setNotice(null);
  }, []);
  const handleSavePromotion = useCallback(async () => {
    if (!canWrite) {
      setErrorMessage("Your role is read-only for promotion updates.");
      return;
    }
    if (!csrfToken) {
      setErrorMessage(
        "Security token is initializing. Please retry in a moment.",
      );
      return;
    }
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) {
      setErrorMessage("Code must be 3-32 chars with A-Z, 0-9, and dash.");
      return;
    }
    if (name.length < 2 || name.length > 80) {
      setErrorMessage("Name must be between 2 and 80 characters.");
      return;
    }
    if (
      !Number.isInteger(form.priority) ||
      form.priority < 0 ||
      form.priority > 1000
    ) {
      setErrorMessage("Priority must be an integer between 0 and 1000.");
      return;
    }
    if (!Number.isInteger(form.discountValue) || form.discountValue <= 0) {
      setErrorMessage("Discount value must be a positive integer.");
      return;
    }
    if (form.discountType === "percent" && form.discountValue > 100) {
      setErrorMessage("Percent discount cannot exceed 100.");
      return;
    }
    if (!Number.isInteger(form.minSubtotalCents) || form.minSubtotalCents < 0) {
      setErrorMessage("Min subtotal must be 0 or more.");
      return;
    }
    const startsAt =
      form.startsAt.trim().length > 0
        ? new Date(form.startsAt).toISOString()
        : null;
    const endsAt =
      form.endsAt.trim().length > 0
        ? new Date(form.endsAt).toISOString()
        : null;
    if (
      startsAt &&
      endsAt &&
      new Date(endsAt).getTime() <= new Date(startsAt).getTime()
    ) {
      setErrorMessage("End date must be after start date.");
      return;
    }
    let maxDiscountCents: number | null = null;
    if (form.maxDiscountCents.trim().length > 0) {
      const value = Number(form.maxDiscountCents);
      if (!Number.isInteger(value) || value <= 0) {
        setErrorMessage("Max discount must be a positive integer or empty.");
        return;
      }
      maxDiscountCents = value;
    }
    let usageLimit: number | null = null;
    if (form.usageLimit.trim().length > 0) {
      const value = Number(form.usageLimit);
      if (!Number.isInteger(value) || value <= 0) {
        setErrorMessage("Usage limit must be a positive integer or empty.");
        return;
      }
      usageLimit = value;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          promotion: {
            id: form.id ?? undefined,
            code,
            name,
            description: form.description.trim(),
            triggerType: form.triggerType,
            stackMode: form.stackMode,
            priority: form.priority,
            scope: {
              sports: form.sportsScope,
              categories: form.categoriesScope,
              productIds: form.productIdsScope,
            },
            discountType: form.discountType,
            discountValue: form.discountValue,
            minSubtotalCents: form.minSubtotalCents,
            maxDiscountCents,
            startsAt,
            endsAt,
            isActive: form.isActive,
            usageLimit,
          },
        }),
      });
      const body = (await response.json()) as PromotionMutationResponse;
      if (!response.ok || !body.promotion) {
        throw new Error(body.error || "Could not save promotion.");
      }
      await loadPromotions();
      setSelectedPromotionId(body.promotion.id);
      setForm(toFormState(body.promotion));
      setNotice(`Promotion ${body.promotion.code} saved.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save promotion.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [canWrite, csrfToken, form, loadPromotions]);
  const handleDeletePromotion = useCallback(async () => {
    if (!selectedPromotionId) {
      return;
    }
    if (!canWrite) {
      setErrorMessage("Your role is read-only for promotion updates.");
      return;
    }
    if (!csrfToken) {
      setErrorMessage(
        "Security token is initializing. Please retry in a moment.",
      );
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ id: selectedPromotionId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Could not delete promotion.");
      }
      await loadPromotions();
      resetForm();
      setNotice("Promotion deleted.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete promotion.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [canWrite, csrfToken, loadPromotions, resetForm, selectedPromotionId]);
  return (
    <div className="space-y-4">
      <article className="glass-card rounded-3xl p-5 sm:p-6">
        <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
          <Megaphone className="h-5 w-5 text-accent" /> Promotions Engine
        </h3>
        <p className="mt-2 text-sm text-muted">
          Scoped promotions + stack/priority rules are active. Baseline revenue
          is
          <span className="font-semibold text-brand">
            {formatPrice(revenueBaselineCents)}
          </span>
          .
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="surface-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">
              Active
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand">
              {promotionStats.active}
            </p>
          </div>
          <div className="surface-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">
              Scheduled
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand">
              {promotionStats.scheduled}
            </p>
          </div>
          <div className="surface-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">
              Expired
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand">
              {promotionStats.expired}
            </p>
          </div>
          <div className="surface-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">
              Inactive
            </p>
            <p className="mt-2 text-2xl font-semibold text-brand">
              {promotionStats.inactive}
            </p>
          </div>
        </div>
      </article>
      {notice ? (
        <p className="status-success rounded-xl px-3 py-2 text-sm">{notice}</p>
      ) : null}
      {errorMessage ? (
        <p className="status-error rounded-xl px-3 py-2 text-sm">
          {errorMessage}
        </p>
      ) : null}
      {!canWrite ? (
        <p className="status-info rounded-xl px-3 py-2 text-sm">
          Your role can view promotions but cannot create, update, or delete
          rules.
        </p>
      ) : null}
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.08fr)_minmax(25rem,0.92fr)] 2xl:items-start">
        <article className="glass-card min-w-0 rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xl font-semibold text-brand">
              Campaign Library
            </h4>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                setErrorMessage(null);
                setNotice(null);
                void Promise.all([loadPromotions(), loadCatalogOptions()])
                  .catch((error) => {
                    setErrorMessage(
                      error instanceof Error
                        ? error.message
                        : "Unable to refresh admin data.",
                    );
                  })
                  .finally(() => setIsLoading(false));
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold btn-secondary"
            >
              <RefreshCcw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search by code, trigger, stack mode"
              className="themed-input h-10 w-full rounded-xl pl-9 pr-3 text-sm focus:outline-none"
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as PromotionStatusFilter);
                setPage(1);
              }}
              className="themed-input h-9 rounded-lg px-3 text-xs focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={triggerFilter}
              onChange={(event) => {
                setTriggerFilter(
                  event.target.value as PromotionTriggerType | "all",
                );
                setPage(1);
              }}
              className="themed-input h-9 rounded-lg px-3 text-xs focus:outline-none"
            >
              <option value="all">All triggers</option>
              <option value="code">Code</option>
              <option value="automatic">Automatic</option>
            </select>
            <select
              value={stackFilter}
              onChange={(event) => {
                setStackFilter(
                  event.target.value as PromotionStackMode | "all",
                );
                setPage(1);
              }}
              className="themed-input h-9 rounded-lg px-3 text-xs focus:outline-none"
            >
              <option value="all">All stack modes</option>
              <option value="exclusive">Exclusive</option>
              <option value="stackable">Stackable</option>
            </select>
            <select
              value={String(pageSize)}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="themed-input h-9 rounded-lg px-3 text-xs focus:outline-none"
            >
              {!promotionsPageSizeOptions.includes(pageSize) ? (
                <option value={String(pageSize)}>{`${pageSize} / page`}</option>
              ) : null}
              {promotionsPageSizeOptions.map((size) => (
                <option
                  key={`promotion-page-size-${size}`}
                  value={String(size)}
                >
                  {`${size} / page`}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-muted">
            Showing
            <span className="font-semibold text-brand">
              {promotionPagination.total === 0
                ? 0
                : (promotionPagination.page - 1) *
                    promotionPagination.pageSize +
                  1}
            </span>
            -
            <span className="font-semibold text-brand">
              {promotionPagination.total === 0
                ? 0
                : Math.min(
                    promotionPagination.page * promotionPagination.pageSize,
                    promotionPagination.total,
                  )}
            </span>
            of
            <span className="font-semibold text-brand">
              {promotionPagination.total}
            </span>
            promotions
          </p>
          {isLoading ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-brand/15 bg-surface px-3 py-2 text-sm text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Loading
              promotions...
            </p>
          ) : null}
          {!isLoading && promotions.length === 0 ? (
            <p className="mt-4 rounded-xl border border-brand/15 bg-surface p-4 text-sm text-muted">
              No promotions found.
            </p>
          ) : null}
          {!isLoading && promotions.length > 0 ? (
            <div className="mt-4 grid gap-2.5 md:hidden">
              {promotions.map((promotion) => {
                const isSelected = selectedPromotionId === promotion.id;
                const status = getRuntimeStatus(promotion);
                const scopeLabel =
                  [
                    promotion.scope.sports[0],
                    promotion.scope.categories[0],
                    promotion.scope.productIds[0],
                  ].filter(Boolean)[0] || "All catalog";
                const usageLabel =
                  promotion.usageLimit !== null
                    ? `${promotion.usageCount}/${promotion.usageLimit}`
                    : String(promotion.usageCount);
                return (
                  <article
                    key={`promotion-mobile-${promotion.id}`}
                    className={`rounded-2xl border p-3 ${isSelected ? "border-[var(--brand-action)] bg-[color-mix(in_oklab,var(--brand-action)_10%,transparent)]" : "border-brand/15 bg-surface"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-muted">
                          {promotion.code}
                        </p>
                        <h5 className="truncate text-sm font-semibold text-brand">
                          {promotion.name}
                        </h5>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${runtimeStatusClasses[status]}`}
                      >
                        {status}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">
                      {promotion.description}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                      <div>
                        <dt className="uppercase tracking-[0.1em] text-muted">
                          Discount
                        </dt>
                        <dd className="font-semibold text-brand">
                          {promotion.discountType === "percent"
                            ? `${promotion.discountValue}% off`
                            : `${formatPrice(promotion.discountValue)} off`}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.1em] text-muted">
                          Scope
                        </dt>
                        <dd className="truncate font-semibold text-brand">
                          {scopeLabel}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.1em] text-muted">
                          Stack / Priority
                        </dt>
                        <dd className="font-semibold text-brand">
                          {promotion.stackMode} / P{promotion.priority}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.1em] text-muted">
                          Usage
                        </dt>
                        <dd className="font-semibold text-brand">
                          {usageLabel}
                        </dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPromotionId(promotion.id);
                        setForm(toFormState(promotion));
                        setNotice(null);
                        setErrorMessage(null);
                      }}
                      className={`mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border px-3 text-xs font-semibold transition ${isSelected ? "btn-primary" : "btn-secondary"}`}
                    >
                      {isSelected ? "Selected" : "Edit Rule"}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}
          {!isLoading && promotions.length > 0 ? (
            <div className="admin-table-wrap admin-table-mobile mt-4 hidden max-h-[56rem] md:block">
              <table className="admin-table admin-table-pin-first admin-table-pin-last text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th className="hidden lg:table-cell">Scope</th>
                    <th>Discount</th>
                    <th className="hidden md:table-cell">Stack / Priority</th>
                    <th className="hidden text-right md:table-cell">Usage</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((promotion) => {
                    const isSelected = selectedPromotionId === promotion.id;
                    const status = getRuntimeStatus(promotion);
                    const scopeLabel =
                      [
                        promotion.scope.sports[0],
                        promotion.scope.categories[0],
                        promotion.scope.productIds[0],
                      ].filter(Boolean)[0] || "All catalog";
                    return (
                      <tr
                        key={promotion.id}
                        className={
                          isSelected
                            ? "bg-[color-mix(in_oklab,var(--brand-action)_14%,transparent)]"
                            : undefined
                        }
                      >
                        <td className="font-mono text-[11px] sm:text-xs">
                          {promotion.code}
                        </td>
                        <td>
                          <p className="font-semibold text-brand">
                            {promotion.name}
                          </p>
                          <p className="max-w-xs truncate text-[11px] text-muted">
                            {promotion.description}
                          </p>
                        </td>
                        <td>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${runtimeStatusClasses[status]}`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="hidden max-w-[13rem] truncate lg:table-cell">
                          {scopeLabel}
                        </td>
                        <td>
                          {promotion.discountType === "percent"
                            ? `${promotion.discountValue}% off`
                            : `${formatPrice(promotion.discountValue)} off`}
                        </td>
                        <td className="hidden md:table-cell">
                          {promotion.stackMode} / P{promotion.priority}
                        </td>
                        <td className="hidden text-right md:table-cell">
                          {promotion.usageLimit !== null
                            ? `${promotion.usageCount}/${promotion.usageLimit}`
                            : promotion.usageCount}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPromotionId(promotion.id);
                              setForm(toFormState(promotion));
                              setNotice(null);
                              setErrorMessage(null);
                            }}
                            className={`inline-flex h-8 items-center rounded-lg border px-3 text-[11px] font-semibold transition ${isSelected ? "btn-primary" : "btn-secondary"}`}
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
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={promotionPagination.page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              className="inline-flex h-9 min-w-[6.1rem] items-center justify-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-60"
            >
              Previous
            </button>
            <p className="text-xs text-muted">
              Page
              <span className="font-semibold text-brand">
                {promotionPagination.page}
              </span>
              of
              <span className="font-semibold text-brand">
                {promotionPagination.totalPages}
              </span>
            </p>
            <button
              type="button"
              disabled={
                promotionPagination.page >= promotionPagination.totalPages ||
                isLoading
              }
              onClick={() =>
                setPage((current) =>
                  Math.min(current + 1, promotionPagination.totalPages),
                )
              }
              className="inline-flex h-9 min-w-[6.1rem] items-center justify-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </article>
        <article className="glass-card min-w-0 rounded-3xl p-5 sm:p-6">
          <h4 className="text-xl font-semibold text-brand">Rule Editor</h4>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase().replace(/\s+/g, ""),
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
                placeholder="Code"
              />
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
                placeholder="Name"
              />
            </div>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="themed-input min-h-20 rounded-xl px-3 py-2 text-sm focus:outline-none"
              placeholder="Description"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={form.triggerType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    triggerType: event.target.value as PromotionTriggerType,
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              >
                <option value="code">Code Trigger</option>
                <option value="automatic">Automatic Trigger</option>
              </select>
              <select
                value={form.stackMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    stackMode: event.target.value as PromotionStackMode,
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              >
                <option value="exclusive">Exclusive</option>
                <option value="stackable">Stackable</option>
              </select>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: Number(event.target.value),
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              >
                {!priorityOptions.includes(form.priority) ? (
                  <option
                    value={form.priority}
                  >{`Priority ${form.priority}`}</option>
                ) : null}
                {priorityOptions.map((priority) => (
                  <option key={`priority-option-${priority}`} value={priority}>
                    {`Priority ${priority}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={selectedSportScope}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  setForm((current) => ({
                    ...current,
                    sportsScope: nextValue ? [nextValue] : [],
                  }));
                }}
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
                title="Choose sport scope for this promotion"
              >
                <option value="">All sports</option>
                {selectedSportScope &&
                !sportScopeOptions.includes(selectedSportScope) ? (
                  <option value={selectedSportScope}>
                    {selectedSportScope}
                  </option>
                ) : null}
                {sportScopeOptions.map((sport) => (
                  <option key={`sport-scope-${sport}`} value={sport}>
                    {sport}
                  </option>
                ))}
              </select>
              <select
                value={selectedCategoryScope}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  setForm((current) => ({
                    ...current,
                    categoriesScope: nextValue ? [nextValue] : [],
                  }));
                }}
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
                title="Choose category scope for this promotion"
              >
                <option value="">All categories</option>
                {selectedCategoryScope &&
                !categoryScopeOptions.includes(selectedCategoryScope) ? (
                  <option value={selectedCategoryScope}>
                    {selectedCategoryScope}
                  </option>
                ) : null}
                {categoryScopeOptions.map((category) => (
                  <option key={`category-scope-${category}`} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                value={selectedProductIdScope}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  setForm((current) => ({
                    ...current,
                    productIdsScope: nextValue ? [nextValue] : [],
                  }));
                }}
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
                title="Choose product scope for this promotion"
              >
                <option value="">All products</option>
                {selectedProductIdScope &&
                !productIdScopeOptions.includes(selectedProductIdScope) ? (
                  <option value={selectedProductIdScope}>
                    {selectedProductIdScope}
                  </option>
                ) : null}
                {productIdScopeOptions.map((productId) => (
                  <option key={`product-scope-${productId}`} value={productId}>
                    {productId}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={form.discountType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    discountType: event.target.value as PromotionDiscountType,
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed cents</option>
              </select>
              <select
                value={form.discountValue}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    discountValue: Number(event.target.value),
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              >
                {!(
                  form.discountType === "percent"
                    ? percentDiscountOptions
                    : fixedDiscountOptions
                ).includes(form.discountValue) ? (
                  <option value={form.discountValue}>
                    {form.discountValue}
                  </option>
                ) : null}
                {(form.discountType === "percent"
                  ? percentDiscountOptions
                  : fixedDiscountOptions
                ).map((discountValue) => (
                  <option
                    key={`discount-value-${discountValue}`}
                    value={discountValue}
                  >
                    {form.discountType === "percent"
                      ? `${discountValue}%`
                      : `${formatPrice(discountValue)} (${discountValue} cents)`}
                  </option>
                ))}
              </select>
              <select
                value={form.minSubtotalCents}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    minSubtotalCents: Number(event.target.value),
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              >
                {!minSubtotalOptions.includes(form.minSubtotalCents) ? (
                  <option value={form.minSubtotalCents}>
                    {formatPrice(form.minSubtotalCents)}
                  </option>
                ) : null}
                {minSubtotalOptions.map((minSubtotal) => (
                  <option
                    key={`min-subtotal-${minSubtotal}`}
                    value={minSubtotal}
                  >
                    {formatPrice(minSubtotal)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={form.maxDiscountCents}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxDiscountCents: event.target.value,
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              >
                <option value="">No max discount cap</option>
                {form.maxDiscountCents &&
                !maxDiscountOptions.includes(Number(form.maxDiscountCents)) ? (
                  <option value={form.maxDiscountCents}>
                    {`${formatPrice(Number(form.maxDiscountCents))} (${form.maxDiscountCents} cents)`}
                  </option>
                ) : null}
                {maxDiscountOptions.map((maxDiscount) => (
                  <option
                    key={`max-discount-${maxDiscount}`}
                    value={String(maxDiscount)}
                  >
                    {formatPrice(maxDiscount)}
                  </option>
                ))}
              </select>
              <select
                value={form.usageLimit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    usageLimit: event.target.value,
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              >
                <option value="">No usage limit</option>
                {form.usageLimit &&
                !usageLimitOptions.includes(Number(form.usageLimit)) ? (
                  <option value={form.usageLimit}>{form.usageLimit}</option>
                ) : null}
                {usageLimitOptions.map((usageLimit) => (
                  <option
                    key={`usage-limit-${usageLimit}`}
                    value={String(usageLimit)}
                  >
                    {usageLimit}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              />
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endsAt: event.target.value,
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-brand/30 text-[var(--brand-action)]"
              />
              Promotion active
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSaving || !canWrite}
                onClick={handleSavePromotion}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-70"
              >
                {isSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
              {selectedPromotionId ? (
                <button
                  type="button"
                  disabled={isSaving || !canWrite}
                  onClick={handleDeletePromotion}
                  className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-danger disabled:opacity-70"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              ) : null}
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
              >
                Reset
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
