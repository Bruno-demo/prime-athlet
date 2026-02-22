import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Stripe from "stripe";

import { getAuthenticatedUser } from "@/lib/auth";
import { BillingProfile } from "@/lib/account-types";
import {
  AppliedPromotionSnapshot,
  createPendingOrder,
} from "@/lib/orders-repository";
import { createPayPalOrder, isPayPalConfigured } from "@/lib/paypal";
import { getProductsByIds } from "@/lib/products-repository";
import { resolvePromotionsForCart } from "@/lib/promotions-repository";
import { getShippingSettings } from "@/lib/shipping-settings-repository";
import { calculateOrderTotalCents, calculateShippingCents } from "@/lib/shipping";
import { getStripeServer } from "@/lib/stripe";

export const runtime = "nodejs";

interface CheckoutItemInput {
  id: string;
  productId: string;
  quantity: number;
  size: string;
  color: string;
}

type CheckoutPaymentMethod =
  | "stripe"
  | "google_pay"
  | "paypal"
  | "bank_transfer";

interface ParsedCheckoutPayload {
  items: CheckoutItemInput[];
  promotionCode: string | null;
  paymentMethod: CheckoutPaymentMethod;
}

function parseCheckoutPayload(payload: unknown): ParsedCheckoutPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as {
    items?: unknown;
    promotionCode?: unknown;
    paymentMethod?: unknown;
  };
  if (!Array.isArray(body.items)) {
    return null;
  }

  const parsedItems = body.items
    .map((item): CheckoutItemInput | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const input = item as Partial<CheckoutItemInput>;
      if (
        typeof input.id !== "string" ||
        typeof input.quantity !== "number" ||
        input.quantity <= 0 ||
        input.quantity > 99
      ) {
        return null;
      }

      const lineId = input.id.trim();
      const productId =
        typeof input.productId === "string" && input.productId.trim().length > 0
          ? input.productId.trim()
          : lineId;
      const size =
        typeof input.size === "string" && input.size.trim().length > 0
          ? input.size.trim()
          : "One Size";
      const color =
        typeof input.color === "string" && input.color.trim().length > 0
          ? input.color.trim()
          : "Standard";
      if (
        lineId.length < 2 ||
        lineId.length > 200 ||
        productId.length < 2 ||
        productId.length > 120 ||
        size.length > 24 ||
        color.length > 24
      ) {
        return null;
      }

      return {
        id: lineId,
        productId,
        quantity: Math.floor(input.quantity),
        size,
        color,
      };
    })
    .filter((item): item is CheckoutItemInput => item !== null);

  if (parsedItems.length === 0) {
    return null;
  }

  let promotionCode: string | null = null;
  if (typeof body.promotionCode === "string") {
    const normalizedCode = body.promotionCode.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(normalizedCode)) {
      return null;
    }
    promotionCode = normalizedCode;
  }

  const rawPaymentMethod =
    typeof body.paymentMethod === "string"
      ? body.paymentMethod.trim().toLowerCase()
      : "stripe";
  const paymentMethodValues: CheckoutPaymentMethod[] = [
    "stripe",
    "google_pay",
    "paypal",
    "bank_transfer",
  ];
  if (!paymentMethodValues.includes(rawPaymentMethod as CheckoutPaymentMethod)) {
    return null;
  }

  return {
    items: parsedItems,
    promotionCode,
    paymentMethod: rawPaymentMethod as CheckoutPaymentMethod,
  };
}

function getRequestOrigin(request: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  if (host) {
    return `${proto}://${host}`;
  }

  return "http://localhost:3000";
}

function buildBankTransferInstructions(orderReference: string) {
  return {
    bankName: process.env.BANK_TRANSFER_BANK_NAME?.trim() || "Prime Athlete Business Bank",
    accountName: process.env.BANK_TRANSFER_ACCOUNT_NAME?.trim() || "Prime Athlete Marketplace LLC",
    accountNumber: process.env.BANK_TRANSFER_ACCOUNT_NUMBER?.trim() || "000123456789",
    iban: process.env.BANK_TRANSFER_IBAN?.trim() || "US00SPOR000123456789",
    swift: process.env.BANK_TRANSFER_SWIFT?.trim() || "SPORUS00",
    reference: orderReference,
    note:
      process.env.BANK_TRANSFER_NOTE?.trim() ||
      "Use the exact reference in your transfer note. Orders are confirmed after funds settle.",
  };
}

function createBankTransferReference(): string {
  return `bank_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function toStripeAddressFromBillingProfile(
  billingProfile: BillingProfile | null | undefined,
): Stripe.AddressParam | undefined {
  if (!billingProfile) {
    return undefined;
  }

  const country =
    /^[A-Za-z]{2}$/.test(billingProfile.country.trim())
      ? billingProfile.country.trim().toUpperCase()
      : undefined;

  const address: Stripe.AddressParam = {};
  if (billingProfile.line1.trim()) {
    address.line1 = billingProfile.line1.trim();
  }
  if (billingProfile.line2.trim()) {
    address.line2 = billingProfile.line2.trim();
  }
  if (billingProfile.city.trim()) {
    address.city = billingProfile.city.trim();
  }
  if (billingProfile.state.trim()) {
    address.state = billingProfile.state.trim();
  }
  if (billingProfile.postalCode.trim()) {
    address.postal_code = billingProfile.postalCode.trim();
  }
  if (country) {
    address.country = country;
  }

  return Object.keys(address).length > 0 ? address : undefined;
}

async function resolveStripeCustomerId(params: {
  stripe: Stripe;
  email: string;
  displayName: string;
  billingProfile: BillingProfile | null | undefined;
}): Promise<string> {
  const name =
    params.billingProfile?.fullName.trim() || params.displayName.trim() || undefined;
  const phone = params.billingProfile?.phone.trim() || undefined;
  const address = toStripeAddressFromBillingProfile(params.billingProfile);

  const customers = await params.stripe.customers.list({
    email: params.email,
    limit: 1,
  });
  const existing = customers.data[0];

  if (existing) {
    const updates: Stripe.CustomerUpdateParams = {};
    if (name) {
      updates.name = name;
    }
    if (phone) {
      updates.phone = phone;
    }
    if (address) {
      updates.address = address;
    }

    if (Object.keys(updates).length > 0) {
      await params.stripe.customers.update(existing.id, updates);
    }

    return existing.id;
  }

  const created = await params.stripe.customers.create({
    email: params.email,
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
  });

  return created.id;
}

export async function POST(request: Request) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json(
        { error: "Please sign in before starting checkout." },
        { status: 401 },
      );
    }

    if (!authenticatedUser.emailVerifiedAt) {
      return NextResponse.json(
        { error: "Please verify your email before checkout." },
        { status: 403 },
      );
    }

    const payload = await request.json();
    const parsedPayload = parseCheckoutPayload(payload);

    if (!parsedPayload) {
      return NextResponse.json(
        { error: "Invalid checkout payload." },
        { status: 400 },
      );
    }

    const { items, promotionCode, paymentMethod } = parsedPayload;

    const quantityByProductId = new Map<string, number>();
    for (const item of items) {
      quantityByProductId.set(
        item.productId,
        (quantityByProductId.get(item.productId) || 0) + item.quantity,
      );
    }

    const productIds = Array.from(quantityByProductId.keys());
    const products = await getProductsByIds(productIds);
    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "One or more products are unavailable." },
        { status: 400 },
      );
    }
    const productsById = new Map(products.map((product) => [product.id, product]));
    const hasMissingLineProduct = items.some(
      (item) => !productsById.has(item.productId),
    );
    if (hasMissingLineProduct) {
      return NextResponse.json(
        { error: "One or more product variants are unavailable." },
        { status: 400 },
      );
    }

    const checkoutLines = items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new Error("Product variant lookup failed.");
      }
      return {
        ...item,
        product,
        displayName: product.name,
      };
    });

    const subtotalCents = checkoutLines.reduce((sum, line) => {
      return sum + line.product.priceCents * line.quantity;
    }, 0);

    const origin = getRequestOrigin(request);

    const promotionResolution = await resolvePromotionsForCart({
      code: promotionCode,
      items: Array.from(quantityByProductId.entries()).map(
        ([productId, quantity]) => {
          const product = productsById.get(productId);
          if (!product) {
            throw new Error("Promotion resolution product lookup failed.");
          }
          return {
            id: product.id,
            sport: product.sport,
            category: product.category,
            quantity,
            unitAmountCents: product.priceCents,
          };
        },
      ),
    });

    if (!promotionResolution.valid) {
      return NextResponse.json(
        {
          error: promotionResolution.reason || "Promotion code is invalid for this cart.",
        },
        { status: 400 },
      );
    }

    const appliedPromotions: AppliedPromotionSnapshot[] =
      promotionResolution.appliedPromotions.map((promotion) => ({
        id: promotion.id,
        code: promotion.code,
        name: promotion.name,
        triggerType: promotion.triggerType,
        stackMode: promotion.stackMode,
        priority: promotion.priority,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        discountCents: promotion.discountCents,
      }));

    const discountCents = promotionResolution.totalDiscountCents;
    const shippingConfig = await getShippingSettings();
    const shippingCents = calculateShippingCents(
      { subtotalCents },
      shippingConfig,
    );
    const orderTotalCents = calculateOrderTotalCents({
      subtotalCents,
      discountCents,
      shippingCents,
    });

    if (paymentMethod === "bank_transfer") {
      const orderReference = createBankTransferReference();
      await createPendingOrder({
        stripeSessionId: orderReference,
        paymentProvider: "bank_transfer",
        externalPaymentId: orderReference,
        paymentStatus: "awaiting_transfer",
        customerEmail: authenticatedUser.email,
        subtotalCents,
        discountCents,
        shippingCents,
        totalCents: orderTotalCents,
        promotions: appliedPromotions,
        currency: "usd",
        items: checkoutLines.map((line) => ({
          id: line.id,
          productId: line.product.id,
          name: line.product.name,
          quantity: line.quantity,
          unitAmountCents: line.product.priceCents,
          size: line.size,
          color: line.color,
        })),
      });

      return NextResponse.json({
        mode: "instructions",
        provider: "bank_transfer",
        orderReference,
        totalCents: orderTotalCents,
        instructions: buildBankTransferInstructions(orderReference),
      });
    }

    if (paymentMethod === "paypal") {
      if (!isPayPalConfigured()) {
        return NextResponse.json(
          {
            error:
              "PayPal is not configured yet. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
          },
          { status: 503 },
        );
      }

      const paypalOrder = await createPayPalOrder({
        amountCents: orderTotalCents,
        currency: "usd",
        returnUrl: `${origin}/api/paypal/return`,
        cancelUrl: `${origin}/cart?status=cancelled&provider=paypal`,
        referenceId: `prime-athlete-${Date.now()}`,
        description: `Prime Athlete cart (${checkoutLines.length} items)`,
      });
      const orderReference = `paypal_${paypalOrder.orderId}`;

      await createPendingOrder({
        stripeSessionId: orderReference,
        paymentProvider: "paypal",
        externalPaymentId: paypalOrder.orderId,
        paymentStatus: "unpaid",
        customerEmail: authenticatedUser.email,
        subtotalCents,
        discountCents,
        shippingCents,
        totalCents: orderTotalCents,
        promotions: appliedPromotions,
        currency: "usd",
        items: checkoutLines.map((line) => ({
          id: line.id,
          productId: line.product.id,
          name: line.product.name,
          quantity: line.quantity,
          unitAmountCents: line.product.priceCents,
          size: line.size,
          color: line.color,
        })),
      });

      return NextResponse.json({
        mode: "redirect",
        provider: "paypal",
        url: paypalOrder.approvalUrl,
      });
    }

    const stripe = getStripeServer();
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;

    if (discountCents > 0) {
      const couponCodes = appliedPromotions.map((promotion) => promotion.code).join("+");
      const stripeCoupon = await stripe.coupons.create({
        duration: "once",
        amount_off: discountCents,
        currency: "usd",
        name: `Prime Athlete ${couponCodes}`.slice(0, 120),
        metadata: {
          promotionIds: appliedPromotions.map((promotion) => promotion.id).join(","),
          promotionCodes: appliedPromotions.map((promotion) => promotion.code).join(","),
        },
      });
      discounts = [{ coupon: stripeCoupon.id }];
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      checkoutLines.map((line) => ({
        quantity: line.quantity,
        price_data: {
          currency: "usd",
          product_data: {
            name: line.product.name,
            description: `${line.product.sport} - ${line.product.category} - ${line.size} / ${line.color}`,
            metadata: {
              productId: line.product.id,
              lineId: line.id,
              size: line.size,
              color: line.color,
            },
          },
          unit_amount: line.product.priceCents,
        },
      }));
    if (shippingCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: {
            name: "Shipping",
            description: "Standard shipping",
            metadata: {
              lineId: "shipping",
            },
          },
          unit_amount: shippingCents,
        },
      });
    }

    let stripeCustomerId: string | null = null;
    try {
      stripeCustomerId = await resolveStripeCustomerId({
        stripe,
        email: authenticatedUser.email,
        displayName: authenticatedUser.displayName,
        billingProfile: authenticatedUser.billingProfile,
      });
    } catch (customerError) {
      console.error("Stripe customer sync failed, falling back to customer_email.", customerError);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(paymentMethod === "google_pay"
        ? { payment_method_types: ["card"] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[] }
        : {}),
      line_items: lineItems,
      discounts,
      success_url: `${origin}/cart?status=success&provider=${
        paymentMethod === "google_pay" ? "google_pay" : "stripe"
      }`,
      cancel_url: `${origin}/cart?status=cancelled&provider=${
        paymentMethod === "google_pay" ? "google_pay" : "stripe"
      }`,
      billing_address_collection: "required",
      ...(stripeCustomerId
        ? {
            customer: stripeCustomerId,
            customer_update: {
              address: "auto",
              name: "auto",
            } as Stripe.Checkout.SessionCreateParams.CustomerUpdate,
          }
        : { customer_email: authenticatedUser.email }),
      phone_number_collection: {
        enabled: true,
      },
      metadata: {
        userId: authenticatedUser.id,
        promotionIds: appliedPromotions.map((promotion) => promotion.id).join(","),
        promotionCodes: appliedPromotions.map((promotion) => promotion.code).join(","),
        promotionCount: String(appliedPromotions.length),
        promotionDiscountCents: discountCents > 0 ? String(discountCents) : "0",
        shippingCents: String(shippingCents),
        paymentMethodRequested: paymentMethod,
      },
    });

    await createPendingOrder({
      stripeSessionId: session.id,
      paymentProvider: "stripe",
      externalPaymentId: session.id,
      paymentStatus: session.payment_status,
      customerEmail: authenticatedUser.email,
      subtotalCents,
      discountCents,
      shippingCents,
      totalCents: orderTotalCents,
      promotions: appliedPromotions,
      currency: session.currency || "usd",
      items: checkoutLines.map((line) => ({
        id: line.id,
        productId: line.product.id,
        name: line.product.name,
        quantity: line.quantity,
        unitAmountCents: line.product.priceCents,
        size: line.size,
        color: line.color,
      })),
    });

    return NextResponse.json({
      mode: "redirect",
      provider: paymentMethod,
      url: session.url,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
