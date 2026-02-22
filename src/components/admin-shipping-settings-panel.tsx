"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Truck } from "lucide-react";

import { formatPrice } from "@/lib/catalog";
import { calculateShippingCents } from "@/lib/shipping";

interface ShippingSettingsResponse {
  flatRateCents?: number;
  freeShippingThresholdCents?: number;
  error?: string;
}

interface AdminShippingSettingsPanelProps {
  csrfToken: string;
  canWrite: boolean;
}

const flatRateOptions = [0, 300, 500, 700, 900, 1200, 1500, 2000, 3000];
const freeThresholdOptions = [0, 5000, 8000, 10_000, 12_000, 15_000, 20_000, 30_000];
const previewSubtotals = [4500, 9000, 12_000, 20_000];

export function AdminShippingSettingsPanel({
  csrfToken,
  canWrite,
}: AdminShippingSettingsPanelProps) {
  const [flatRateCents, setFlatRateCents] = useState(900);
  const [freeShippingThresholdCents, setFreeShippingThresholdCents] = useState(12_000);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/shipping-settings", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as ShippingSettingsResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load shipping settings.");
      }
      if (typeof body.flatRateCents === "number") {
        setFlatRateCents(body.flatRateCents);
      }
      if (typeof body.freeShippingThresholdCents === "number") {
        setFreeShippingThresholdCents(body.freeShippingThresholdCents);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load shipping settings.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const previewRows = useMemo(
    () =>
      previewSubtotals.map((subtotalCents) => ({
        subtotalCents,
        shippingCents: calculateShippingCents(
          { subtotalCents },
          {
            flatRateCents,
            freeShippingThresholdCents,
          },
        ),
      })),
    [flatRateCents, freeShippingThresholdCents],
  );

  async function saveSettings() {
    if (!canWrite) {
      setErrorMessage("Your role is read-only for shipping settings.");
      return;
    }
    if (!csrfToken) {
      setErrorMessage("Security token is not ready. Retry in a moment.");
      return;
    }

    setIsSaving(true);
    setNotice(null);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/shipping-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          flatRateCents,
          freeShippingThresholdCents,
        }),
      });
      const body = (await response.json()) as ShippingSettingsResponse & {
        success?: boolean;
      };
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Unable to save shipping settings.");
      }
      setNotice("Shipping settings saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save shipping settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="surface-card rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-brand">
            <Truck className="h-4 w-4 text-accent" /> Shipping Pricing
          </h3>
          <p className="mt-1 text-xs text-muted">
            Configure flat shipping and free-shipping threshold used in cart and
            checkout.
          </p>
        </div>
        {isLoading ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading...
          </p>
        ) : null}
      </div>

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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Flat Rate
          </span>
          <select
            value={String(flatRateCents)}
            onChange={(event) => setFlatRateCents(Number(event.target.value))}
            className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
            disabled={isLoading}
          >
            {!flatRateOptions.includes(flatRateCents) ? (
              <option value={String(flatRateCents)}>
                {formatPrice(flatRateCents)}
              </option>
            ) : null}
            {flatRateOptions.map((value) => (
              <option key={`shipping-flat-${value}`} value={String(value)}>
                {value === 0 ? "Free" : formatPrice(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Free Shipping Threshold
          </span>
          <select
            value={String(freeShippingThresholdCents)}
            onChange={(event) =>
              setFreeShippingThresholdCents(Number(event.target.value))
            }
            className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
            disabled={isLoading}
          >
            {!freeThresholdOptions.includes(freeShippingThresholdCents) ? (
              <option value={String(freeShippingThresholdCents)}>
                {formatPrice(freeShippingThresholdCents)}
              </option>
            ) : null}
            {freeThresholdOptions.map((value) => (
              <option key={`shipping-threshold-${value}`} value={String(value)}>
                {value === 0 ? "Never free" : `${formatPrice(value)}+`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-brand/15 bg-surface-soft p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Preview
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {previewRows.map((row) => (
            <div
              key={`shipping-preview-${row.subtotalCents}`}
              className="rounded-lg border border-brand/12 bg-surface px-3 py-2 text-xs text-muted"
            >
              <p>
                Subtotal:{" "}
                <span className="font-semibold text-brand">
                  {formatPrice(row.subtotalCents)}
                </span>
              </p>
              <p>
                Shipping:{" "}
                <span className="font-semibold text-brand">
                  {row.shippingCents === 0
                    ? "Free"
                    : formatPrice(row.shippingCents)}
                </span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={!canWrite || isSaving || isLoading}
          className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save shipping settings"}
        </button>
        <button
          type="button"
          onClick={() => void loadSettings()}
          disabled={isSaving}
          className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold btn-secondary disabled:opacity-60"
        >
          Refresh
        </button>
      </div>
    </article>
  );
}
