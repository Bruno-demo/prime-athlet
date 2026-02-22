import "server-only";

export type PayPalEnvironment = "sandbox" | "live";

interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: PayPalEnvironment;
  baseUrl: string;
}

interface PayPalTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface PayPalErrorDetail {
  issue?: string;
  description?: string;
}

interface PayPalErrorResponse {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: PayPalErrorDetail[];
}

interface PayPalLink {
  href?: string;
  rel?: string;
  method?: string;
}

interface CreatePayPalOrderResponse {
  id?: string;
  status?: string;
  links?: PayPalLink[];
}

interface CapturePayPalOrderResponse {
  id?: string;
  status?: string;
  payer?: {
    email_address?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
    address?: {
      address_line_1?: string;
      address_line_2?: string;
      admin_area_2?: string;
      admin_area_1?: string;
      postal_code?: string;
      country_code?: string;
    };
  };
  purchase_units?: Array<{
    shipping?: {
      name?: {
        full_name?: string;
      };
      address?: {
        address_line_1?: string;
        address_line_2?: string;
        admin_area_2?: string;
        admin_area_1?: string;
        postal_code?: string;
        country_code?: string;
      };
    };
    payments?: {
      captures?: Array<{
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
}

declare global {
  var _sportivaPayPalToken:
    | {
        accessToken: string;
        expiresAtMs: number;
      }
    | undefined;
}

function getPayPalConfig(): PayPalConfig | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  const environmentRaw = process.env.PAYPAL_ENV?.trim().toLowerCase();
  const environment: PayPalEnvironment =
    environmentRaw === "live" ? "live" : "sandbox";

  return {
    clientId,
    clientSecret,
    environment,
    baseUrl:
      environment === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com",
  };
}

export function isPayPalConfigured(): boolean {
  return getPayPalConfig() !== null;
}

function toMoneyFromCents(amountCents: number): string {
  const normalized = Math.max(Math.floor(amountCents), 0);
  return (normalized / 100).toFixed(2);
}

function parseAmountCents(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

async function readPayPalError(response: Response): Promise<Error> {
  let message = `PayPal request failed (${response.status}).`;
  const headerDebugId = response.headers.get("paypal-debug-id");

  try {
    const payload = (await response.json()) as PayPalErrorResponse;
    if (payload.message || payload.name) {
      message = [payload.name, payload.message].filter(Boolean).join(": ");
    }
    if (Array.isArray(payload.details) && payload.details.length > 0) {
      const detail = payload.details
        .map((entry) =>
          [entry.issue, entry.description].filter(Boolean).join(" - "),
        )
        .filter((entry) => entry.length > 0)
        .join("; ");
      if (detail) {
        message = `${message} (${detail})`;
      }
    }
    if (payload.debug_id) {
      message = `${message} [debug_id=${payload.debug_id}]`;
    } else if (headerDebugId) {
      message = `${message} [debug_id=${headerDebugId}]`;
    }
  } catch {
    // Keep fallback message when body is not JSON.
    if (headerDebugId) {
      message = `${message} [debug_id=${headerDebugId}]`;
    }
  }

  return new Error(message);
}

async function getPayPalAccessToken(): Promise<{
  token: string;
  config: PayPalConfig;
}> {
  const config = getPayPalConfig();
  if (!config) {
    throw new Error(
      "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    );
  }

  const now = Date.now();
  const cached = global._sportivaPayPalToken;
  if (cached && cached.expiresAtMs > now + 30_000) {
    return { token: cached.accessToken, config };
  }

  const basicAuth = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
    "utf8",
  ).toString("base64");

  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readPayPalError(response);
  }

  const payload = (await response.json()) as PayPalTokenResponse;
  if (!payload.access_token || typeof payload.expires_in !== "number") {
    throw new Error("PayPal token response is invalid.");
  }

  global._sportivaPayPalToken = {
    accessToken: payload.access_token,
    expiresAtMs: now + payload.expires_in * 1000,
  };

  return { token: payload.access_token, config };
}

async function paypalJsonRequest<TResponse>(
  path: string,
  init: RequestInit,
): Promise<TResponse> {
  const { token, config } = await getPayPalAccessToken();

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw await readPayPalError(response);
  }

  return (await response.json()) as TResponse;
}

export interface CreatePayPalOrderParams {
  amountCents: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  referenceId: string;
  description: string;
}

export interface CreatePayPalOrderResult {
  orderId: string;
  approvalUrl: string;
}

function buildPayPalCheckoutNowUrl(orderId: string): string {
  const environmentRaw = process.env.PAYPAL_ENV?.trim().toLowerCase();
  const host =
    environmentRaw === "live" ? "www.paypal.com" : "www.sandbox.paypal.com";
  return `https://${host}/checkoutnow?token=${encodeURIComponent(orderId)}`;
}

export async function createPayPalOrder(
  params: CreatePayPalOrderParams,
): Promise<CreatePayPalOrderResult> {
  const currencyCode = params.currency.trim().toUpperCase() || "USD";
  const amountCents = Math.max(Math.floor(params.amountCents), 0);
  if (amountCents <= 0) {
    throw new Error("PayPal checkout requires a positive cart total.");
  }

  const payload = await paypalJsonRequest<CreatePayPalOrderResponse>(
    "/v2/checkout/orders",
    {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: params.referenceId.slice(0, 127),
            custom_id: params.referenceId.slice(0, 127),
            description: params.description.slice(0, 127),
            amount: {
              currency_code: currencyCode,
              value: toMoneyFromCents(amountCents),
            },
          },
        ],
        application_context: {
          brand_name: "PRIME ATHLETE",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
        },
      }),
    },
  );

  const orderId = payload.id?.trim();
  if (!orderId) {
    throw new Error("PayPal order response is missing an order id.");
  }

  const approvalUrlFromLinks = payload.links
    ?.find((link) => {
      const rel = link.rel?.trim().toLowerCase();
      return rel === "approve" || rel === "payer-action";
    })
    ?.href?.trim();
  const approvalUrl =
    approvalUrlFromLinks || buildPayPalCheckoutNowUrl(orderId);

  if (!approvalUrl) {
    throw new Error(
      "PayPal order response is missing approval URL (approve/payer-action).",
    );
  }

  return {
    orderId,
    approvalUrl,
  };
}

export interface CapturePayPalOrderResult {
  orderId: string;
  status: string;
  payerEmail: string | null;
  payerName: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  totalCents: number | null;
  currency: string | null;
}

export async function capturePayPalOrder(
  orderId: string,
): Promise<CapturePayPalOrderResult> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new Error("PayPal order token is missing.");
  }

  const payload = await paypalJsonRequest<CapturePayPalOrderResponse>(
    `/v2/checkout/orders/${encodeURIComponent(normalizedOrderId)}/capture`,
    {
      method: "POST",
      body: "{}",
    },
  );

  const capture = payload.purchase_units?.[0]?.payments?.captures?.[0];
  const amount = capture?.amount;
  const payerAddress = payload.payer?.address;
  const shippingAddress = payload.purchase_units?.[0]?.shipping?.address;
  const effectiveAddress = shippingAddress || payerAddress || null;
  const payerName = [
    payload.payer?.name?.given_name?.trim() || "",
    payload.payer?.name?.surname?.trim() || "",
  ]
    .join(" ")
    .trim();

  return {
    orderId: payload.id?.trim() || normalizedOrderId,
    status: payload.status?.trim().toUpperCase() || "UNKNOWN",
    payerEmail: payload.payer?.email_address?.trim().toLowerCase() || null,
    payerName:
      payerName ||
      payload.purchase_units?.[0]?.shipping?.name?.full_name?.trim() ||
      null,
    address: effectiveAddress
      ? {
          line1: effectiveAddress.address_line_1?.trim() || null,
          line2: effectiveAddress.address_line_2?.trim() || null,
          city: effectiveAddress.admin_area_2?.trim() || null,
          state: effectiveAddress.admin_area_1?.trim() || null,
          postalCode: effectiveAddress.postal_code?.trim() || null,
          country: effectiveAddress.country_code?.trim() || null,
        }
      : null,
    totalCents: parseAmountCents(amount?.value),
    currency: amount?.currency_code?.trim().toLowerCase() || null,
  };
}
