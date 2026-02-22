export interface ShippingComputationInput {
  subtotalCents: number;
}

export interface ShippingConfig {
  flatRateCents: number;
  freeShippingThresholdCents: number;
}

const DEFAULT_SHIPPING_FLAT_CENTS = 900;
const DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS = 12_000;

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(Math.floor(parsed), 0);
}

export function getShippingConfigFromEnv(): ShippingConfig {
  const flatRateRaw =
    process.env.NEXT_PUBLIC_SHIPPING_FLAT_RATE_CENTS ??
    process.env.SHIPPING_FLAT_RATE_CENTS;
  const freeThresholdRaw =
    process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS ??
    process.env.FREE_SHIPPING_THRESHOLD_CENTS;
  return {
    flatRateCents: parseNonNegativeInteger(
      flatRateRaw,
      DEFAULT_SHIPPING_FLAT_CENTS,
    ),
    freeShippingThresholdCents: parseNonNegativeInteger(
      freeThresholdRaw,
      DEFAULT_FREE_SHIPPING_THRESHOLD_CENTS,
    ),
  };
}

export function calculateShippingCents(
  input: ShippingComputationInput,
  config: ShippingConfig = getShippingConfigFromEnv(),
): number {
  const subtotalCents = Math.max(Math.floor(input.subtotalCents), 0);
  if (subtotalCents <= 0) {
    return 0;
  }
  if (
    config.freeShippingThresholdCents > 0 &&
    subtotalCents >= config.freeShippingThresholdCents
  ) {
    return 0;
  }
  return Math.max(Math.floor(config.flatRateCents), 0);
}

export function calculateOrderTotalCents(input: {
  subtotalCents: number;
  discountCents?: number;
  shippingCents?: number;
}): number {
  const subtotalCents = Math.max(Math.floor(input.subtotalCents), 0);
  const discountCents = Math.max(Math.floor(input.discountCents ?? 0), 0);
  const shippingCents = Math.max(Math.floor(input.shippingCents ?? 0), 0);
  const discountedSubtotalCents = Math.max(subtotalCents - discountCents, 0);
  return discountedSubtotalCents + shippingCents;
}

export function deriveShippingCentsFromOrderLike(input: {
  shippingCents?: number | null;
  subtotalCents: number;
  discountCents?: number | null;
  totalCents?: number | null;
}): number {
  if (typeof input.shippingCents === "number" && input.shippingCents >= 0) {
    return Math.floor(input.shippingCents);
  }
  const subtotalCents = Math.max(Math.floor(input.subtotalCents), 0);
  const discountCents = Math.max(Math.floor(input.discountCents ?? 0), 0);
  const discountedSubtotalCents = Math.max(subtotalCents - discountCents, 0);
  if (typeof input.totalCents === "number" && input.totalCents >= 0) {
    return Math.max(Math.floor(input.totalCents) - discountedSubtotalCents, 0);
  }
  return calculateShippingCents({ subtotalCents });
}
