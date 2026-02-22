"use client";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  CheckCircle2,
  Landmark,
  Lock,
  Minus,
  Wallet,
  Plus,
  ShieldCheck,
  ShoppingBag,
  TicketPercent,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import { useCart } from "@/components/cart-context";
import { formatPrice } from "@/lib/catalog";
import {
  DEFAULT_IMAGE_BLUR_DATA_URL,
  DEFAULT_PRODUCT_IMAGE_SRC,
} from "@/lib/image-utils";
import {
  calculateOrderTotalCents,
  calculateShippingCents,
  getShippingConfigFromEnv,
  type ShippingConfig,
} from "@/lib/shipping";
import { renderSportIcon } from "@/lib/sport-icons";
interface CheckoutResponse {
  mode?: "redirect" | "instructions";
  provider?: CheckoutPaymentMethod;
  url?: string;
  orderReference?: string;
  totalCents?: number;
  instructions?: BankTransferInstructions;
  error?: string;
}
type CheckoutPaymentMethod =
  | "stripe"
  | "google_pay"
  | "paypal"
  | "bank_transfer";
interface BankTransferInstructions {
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  swift: string;
  reference: string;
  note: string;
}
interface AppliedPromotion {
  id: string;
  code: string;
  name: string;
  triggerType: "code" | "automatic";
  stackMode: "stackable" | "exclusive";
  priority: number;
  discountType: "percent" | "fixed";
  discountValue: number;
  discountCents: number;
  eligibleSubtotalCents: number;
}
interface PromotionValidationResponse {
  valid: boolean;
  reason: string | null;
  subtotalCents: number;
  discountCents: number;
  finalSubtotalCents: number;
  appliedPromotions: AppliedPromotion[];
  error?: string;
}
interface ShippingSettingsResponse {
  flatRateCents?: number;
  freeShippingThresholdCents?: number;
  error?: string;
}
interface PromotionValidationItem {
  id: string;
  sport: string;
  category: string;
  quantity: number;
  unitAmountCents: number;
}
const paymentMethodOptions: Array<{
  id: CheckoutPaymentMethod;
  label: string;
  description: string;
  icon: typeof CreditCard;
}> = [
  {
    id: "stripe",
    label: "Card Checkout",
    description: "Debit and credit cards via Stripe.",
    icon: CreditCard,
  },
  {
    id: "google_pay",
    label: "Google Pay",
    description: "Fast wallet checkout on supported devices.",
    icon: Wallet,
  },
  {
    id: "paypal",
    label: "PayPal",
    description: "Pay with PayPal balance or linked cards.",
    icon: Banknote,
  },
  {
    id: "bank_transfer",
    label: "Bank Transfer",
    description: "Place order and pay by transfer reference.",
    icon: Landmark,
  },
];
export function CartView() {
  const { items, subtotalCents, setItemQuantity, removeItem, clearCart } =
    useCart();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<CheckoutPaymentMethod>("stripe");
  const [bankTransferResult, setBankTransferResult] = useState<{
    orderReference: string;
    totalCents: number;
    instructions: BankTransferInstructions;
  } | null>(null);
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig>(() =>
    getShippingConfigFromEnv(),
  );
  const [promotionCodeInput, setPromotionCodeInput] = useState("");
  const [activePromotionCode, setActivePromotionCode] = useState<string | null>(
    null,
  );
  const [appliedPromotions, setAppliedPromotions] = useState<
    AppliedPromotion[]
  >([]);
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null);
  const [isApplyingPromotion, setIsApplyingPromotion] = useState(false);
  const [isRefreshingPromotions, setIsRefreshingPromotions] = useState(false);
  const searchParams = useSearchParams();
  const checkoutStatus = searchParams.get("status");
  const checkoutProvider = searchParams.get("provider");
  const checkoutMessage = searchParams.get("message");
  useEffect(() => {
    if (checkoutStatus === "success") {
      clearCart();
      setBankTransferResult(null);
      setAppliedPromotions([]);
      setActivePromotionCode(null);
      setPromotionCodeInput("");
      setPromotionMessage(null);
    }
  }, [checkoutStatus, clearCart]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/shipping/settings", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as ShippingSettingsResponse;
        if (
          !response.ok ||
          typeof payload.flatRateCents !== "number" ||
          typeof payload.freeShippingThresholdCents !== "number"
        ) {
          return;
        }
        if (!cancelled) {
          setShippingConfig({
            flatRateCents: Math.max(Math.floor(payload.flatRateCents), 0),
            freeShippingThresholdCents: Math.max(
              Math.floor(payload.freeShippingThresholdCents),
              0,
            ),
          });
        }
      } catch {
        // Keep env fallback shipping config.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const promotionItems = useMemo<PromotionValidationItem[]>(
    () =>
      items.map((item) => ({
        id: item.productId,
        sport: item.sport,
        category: item.category,
        quantity: item.quantity,
        unitAmountCents: item.priceCents,
      })),
    [items],
  );
  const validatePromotions = useCallback(
    async (code: string | null): Promise<PromotionValidationResponse> => {
      const response = await fetch("/api/promotions/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code || undefined,
          items: promotionItems,
        }),
      });
      const payload = (await response.json()) as PromotionValidationResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Unable to validate promotion code.");
      }
      return payload;
    },
    [promotionItems],
  );
  const syncPromotions = useCallback(
    async (code: string | null, showCodeMessage: boolean) => {
      const normalizedCode = code?.trim().toUpperCase() || null;
      const payload = await validatePromotions(normalizedCode);
      const nextPromotions = Array.isArray(payload.appliedPromotions)
        ? payload.appliedPromotions
        : [];
      if (normalizedCode && !payload.valid) {
        setAppliedPromotions(
          nextPromotions.filter(
            (promotion) => promotion.triggerType === "automatic",
          ),
        );
        setActivePromotionCode(null);
        if (showCodeMessage) {
          setPromotionMessage(payload.reason || "Coupon cannot be applied.");
        }
        return;
      }
      setAppliedPromotions(nextPromotions);
      setActivePromotionCode(normalizedCode);
      if (showCodeMessage && normalizedCode) {
        const appliedCodePromotion = nextPromotions.find(
          (promotion) =>
            promotion.triggerType === "code" &&
            promotion.code === normalizedCode,
        );
        if (appliedCodePromotion) {
          setPromotionMessage(`Coupon ${normalizedCode} applied.`);
        } else {
          setPromotionMessage(
            "Coupon accepted but not currently affecting this cart.",
          );
        }
      }
    },
    [validatePromotions],
  );
  useEffect(() => {
    if (items.length === 0) {
      setAppliedPromotions([]);
      setActivePromotionCode(null);
      setPromotionCodeInput("");
      setPromotionMessage(null);
      return;
    }
    let cancelled = false;
    setIsRefreshingPromotions(true);
    void syncPromotions(activePromotionCode, false)
      .catch(() => {
        if (!cancelled) {
          setPromotionMessage("Promotion validation failed. Try again.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRefreshingPromotions(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activePromotionCode, items.length, syncPromotions, subtotalCents]);
  const discountCents = useMemo(
    () =>
      appliedPromotions.reduce(
        (sum, promotion) => sum + promotion.discountCents,
        0,
      ),
    [appliedPromotions],
  );
  const shippingCents = useMemo(
    () => calculateShippingCents({ subtotalCents }, shippingConfig),
    [shippingConfig, subtotalCents],
  );
  const totalCents = calculateOrderTotalCents({
    subtotalCents,
    discountCents,
    shippingCents,
  });
  const hasAutomaticPromotions = appliedPromotions.some(
    (promotion) => promotion.triggerType === "automatic",
  );
  const checkoutButtonLabel = useMemo(() => {
    if (isCheckingOut) {
      return "Starting checkout...";
    }
    if (paymentMethod === "google_pay") {
      return "Checkout with Google Pay";
    }
    if (paymentMethod === "paypal") {
      return "Checkout with PayPal";
    }
    if (paymentMethod === "bank_transfer") {
      return "Place Bank Transfer Order";
    }
    return "Checkout with Stripe";
  }, [isCheckingOut, paymentMethod]);
  async function handleApplyPromotion() {
    if (isApplyingPromotion || items.length === 0) {
      return;
    }
    const code = promotionCodeInput.trim().toUpperCase();
    if (!code) {
      setPromotionMessage("Enter a coupon code first.");
      return;
    }
    setIsApplyingPromotion(true);
    setPromotionMessage(null);
    setCheckoutError(null);
    try {
      await syncPromotions(code, true);
      setPromotionCodeInput(code);
    } catch (error) {
      setPromotionMessage(
        error instanceof Error ? error.message : "Failed to apply coupon.",
      );
    } finally {
      setIsApplyingPromotion(false);
    }
  }
  function clearPromotionCode() {
    setActivePromotionCode(null);
    setPromotionCodeInput("");
    setPromotionMessage("Coupon removed.");
  }
  async function handleCheckout() {
    if (items.length === 0 || isCheckingOut) {
      return;
    }
    setIsCheckingOut(true);
    setCheckoutError(null);
    try {
      const response = await fetch("/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            size: item.size,
            color: item.color,
          })),
          promotionCode: activePromotionCode || undefined,
          paymentMethod,
        }),
      });
      if (response.status === 401) {
        window.location.href = "/auth/sign-in?next=/cart";
        return;
      }
      if (response.status === 403) {
        window.location.href = "/auth/check-email";
        return;
      }
      const payload = (await response.json()) as CheckoutResponse;
      if (!response.ok) {
        setCheckoutError(payload.error || "Checkout failed. Please try again.");
        return;
      }
      if (
        payload.mode === "instructions" &&
        payload.provider === "bank_transfer" &&
        payload.instructions &&
        payload.orderReference
      ) {
        setBankTransferResult({
          orderReference: payload.orderReference,
          totalCents:
            typeof payload.totalCents === "number"
              ? payload.totalCents
              : totalCents,
          instructions: payload.instructions,
        });
        clearCart();
        return;
      }
      if (payload.url) {
        window.location.href = payload.url;
        return;
      }
      setCheckoutError("Checkout failed. Please try again.");
    } catch {
      setCheckoutError("Could not start checkout. Please try again.");
    } finally {
      setIsCheckingOut(false);
    }
  }
  return (
    <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
      <div className="space-y-4">
        {checkoutStatus === "success" ? (
          <div className="status-success inline-flex w-full items-center gap-2 rounded-xl px-4 py-3 text-sm">
            <CheckCircle2 className="h-4 w-4" /> Payment succeeded
            {checkoutProvider
              ? ` via ${checkoutProvider.replace("_", " ")}`
              : ""}
            . Your order is being processed.
          </div>
        ) : null}
        {checkoutStatus === "cancelled" ? (
          <div className="status-warning inline-flex w-full items-center gap-2 rounded-xl px-4 py-3 text-sm">
            <XCircle className="h-4 w-4" /> Checkout cancelled. Your cart is
            still available.
          </div>
        ) : null}
        {checkoutStatus === "payment_failed" ? (
          <div className="status-error inline-flex w-full items-center gap-2 rounded-xl px-4 py-3 text-sm">
            <XCircle className="h-4 w-4" /> Payment failed
            {checkoutMessage ? `: ${checkoutMessage}` : "."}
          </div>
        ) : null}
        {bankTransferResult ? (
          <article className="status-info rounded-2xl p-4 text-sm">
            <h3 className="font-semibold text-brand">
              Bank transfer order placed
            </h3>
            <p className="mt-2 text-muted">
              Reference:
              <span className="font-mono text-brand">
                {bankTransferResult.orderReference}
              </span>
            </p>
            <p className="mt-1 text-muted">
              Amount due:
              <span className="font-semibold text-brand">
                {formatPrice(bankTransferResult.totalCents)}
              </span>
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <p className="rounded-lg border border-brand/15 bg-surface px-3 py-2">
                <span className="text-xs uppercase tracking-[0.08em] text-muted">
                  Bank
                </span>
                <br />
                <span className="font-semibold text-brand">
                  {bankTransferResult.instructions.bankName}
                </span>
              </p>
              <p className="rounded-lg border border-brand/15 bg-surface px-3 py-2">
                <span className="text-xs uppercase tracking-[0.08em] text-muted">
                  Account
                </span>
                <br />
                <span className="font-semibold text-brand">
                  {bankTransferResult.instructions.accountName}
                </span>
              </p>
              <p className="rounded-lg border border-brand/15 bg-surface px-3 py-2">
                <span className="text-xs uppercase tracking-[0.08em] text-muted">
                  Account Number
                </span>
                <br />
                <span className="font-mono text-brand">
                  {bankTransferResult.instructions.accountNumber}
                </span>
              </p>
              <p className="rounded-lg border border-brand/15 bg-surface px-3 py-2">
                <span className="text-xs uppercase tracking-[0.08em] text-muted">
                  SWIFT / IBAN
                </span>
                <br />
                <span className="font-mono text-brand">
                  {bankTransferResult.instructions.swift} /
                  {bankTransferResult.instructions.iban}
                </span>
              </p>
            </div>
            <p className="mt-3 text-xs text-muted">
              {bankTransferResult.instructions.note}
            </p>
          </article>
        ) : null}
        {items.length === 0 ? (
          <article className="glass-card rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-semibold text-brand">
              Your cart is empty
            </h2>
            <p className="mt-3 text-sm text-muted">
              Add products from the shop to start checkout.
            </p>
            <Link
              href="/shop"
              title="Explore top sports gear and add products to your cart"
              className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold btn-primary"
            >
              <ShoppingBag className="h-4 w-4" /> Browse products
            </Link>
          </article>
        ) : (
          items.map((item) => {
            return (
              <article
                key={item.id}
                className="surface-card rounded-2xl p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="image-frame relative h-20 w-20 shrink-0 rounded-xl">
                      <Image
                        src={item.imageSrc || DEFAULT_PRODUCT_IMAGE_SRC}
                        alt={item.imageAlt || `${item.name} image`}
                        fill
                        sizes="80px"
                        quality={74}
                        placeholder="blur"
                        blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
                        className="image-fit-cover"
                      />
                    </div>
                    <div>
                      <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-muted">
                        {renderSportIcon(item.sport, {
                          className: "h-3.5 w-3.5 text-brand",
                        })}
                        {item.sport}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-brand">
                        {item.name}
                      </h2>
                      <p className="text-sm text-muted">
                        {item.category} • {item.size} • {item.color}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg font-semibold text-brand">
                    {formatPrice(item.priceCents * item.quantity)}
                  </p>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center overflow-hidden rounded-lg border border-brand/20">
                    <button
                      type="button"
                      onClick={() =>
                        setItemQuantity(item.id, item.quantity - 1)
                      }
                      className="h-9 w-9 text-sm font-semibold text-brand transition hover:bg-brand/5"
                      aria-label={`Decrease quantity for ${item.name}`}
                    >
                      <Minus className="mx-auto h-3.5 w-3.5" />
                    </button>
                    <span className="grid h-9 w-10 place-items-center border-x border-brand/20 text-sm font-semibold text-brand">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setItemQuantity(item.id, item.quantity + 1)
                      }
                      className="h-9 w-9 text-sm font-semibold text-brand transition hover:bg-brand/5"
                      aria-label={`Increase quantity for ${item.name}`}
                    >
                      <Plus className="mx-auto h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition hover:text-accent"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
      <aside className="glass-card h-fit rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24">
        <h2 className="text-xl font-semibold text-brand">Order Summary</h2>
        <div className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between text-muted">
            <span>Subtotal</span> <span>{formatPrice(subtotalCents)}</span>
          </div>
          <div className="rounded-xl border border-brand/15 bg-surface-soft p-3">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <TicketPercent className="h-4 w-4 text-accent" /> Coupon Code
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={promotionCodeInput}
                onChange={(event) =>
                  setPromotionCodeInput(event.target.value.toUpperCase())
                }
                placeholder="PRIME10"
                className="themed-input h-10 min-w-0 flex-1 rounded-lg px-3 text-sm focus:outline-none"
              />
              <button
                type="button"
                disabled={isApplyingPromotion || items.length === 0}
                onClick={handleApplyPromotion}
                className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-semibold btn-primary disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isApplyingPromotion ? "Applying..." : "Apply"}
              </button>
            </div>
            {activePromotionCode ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  Active coupon:
                  <span className="font-semibold text-brand">
                    {activePromotionCode}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={clearPromotionCode}
                  className="text-xs font-semibold text-brand transition hover:text-accent"
                >
                  Remove
                </button>
              </div>
            ) : null}
            {promotionMessage ? (
              <p className="mt-2 text-xs text-muted">{promotionMessage}</p>
            ) : null}
          </div>
          {appliedPromotions.length > 0 ? (
            <div className="space-y-1.5">
              {appliedPromotions.map((promotion) => (
                <div
                  key={`${promotion.id}-${promotion.priority}`}
                  className="flex items-center justify-between text-[var(--status-success-text)]"
                >
                  <span className="truncate pr-3">
                    {promotion.code} (
                    {promotion.triggerType === "automatic" ? "Auto" : "Code"})
                  </span>
                  <span>-{formatPrice(promotion.discountCents)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {discountCents > 0 ? (
            <div className="flex items-center justify-between border-t border-brand/10 pt-2 text-[var(--status-success-text)]">
              <span>Total Discount</span>
              <span>-{formatPrice(discountCents)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-4 w-4" /> Shipping
            </span>
            <span>
              {shippingCents === 0 ? "Free" : formatPrice(shippingCents)}
            </span>
          </div>
          <div className="border-t border-brand/10 pt-3">
            <div className="flex items-center justify-between text-base font-semibold text-brand">
              <span>Total</span> <span>{formatPrice(totalCents)}</span>
            </div>
          </div>
        </div>
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Payment Method
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {paymentMethodOptions.map((option) => {
              const Icon = option.icon;
              const isActive = paymentMethod === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPaymentMethod(option.id)}
                  title={`Use ${option.label} for checkout`}
                  className={`rounded-xl border px-3 py-2 text-left transition ${isActive ? "btn-primary" : "border-brand/20 bg-surface-soft text-brand hover:border-brand/45"}`}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4" /> {option.label}
                  </span>
                  <p
                    className={`mt-1 text-xs ${isActive ? "text-[var(--color-on-solid-90)]" : "text-muted"}`}
                  >
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCheckout}
          disabled={
            items.length === 0 || isCheckingOut || isRefreshingPromotions
          }
          title="Proceed to secure checkout and place your order"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-[var(--color-on-solid)] transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-65"
        >
          <Lock className="mr-2 h-4 w-4" /> {checkoutButtonLabel}
        </button>
        {checkoutError ? (
          <p className="mt-3 text-sm text-[var(--status-error-text)]">
            {checkoutError}
          </p>
        ) : null}
        {hasAutomaticPromotions ? (
          <p className="mt-3 text-xs text-[var(--status-success-text)]">
            Automatic promotions are active for this cart.
          </p>
        ) : null}
        <p className="mt-4 inline-flex items-start gap-1.5 text-xs leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Secure
          encrypted checkout. Wallet availability can vary by browser and
          device.
        </p>
      </aside>
    </section>
  );
}
