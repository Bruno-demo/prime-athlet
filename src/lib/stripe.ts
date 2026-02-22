import Stripe from "stripe";

declare global {
  var _stripeClient: Stripe | undefined;
}

export function getStripeServer(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  if (!global._stripeClient) {
    global._stripeClient = new Stripe(secretKey);
  }

  return global._stripeClient;
}
