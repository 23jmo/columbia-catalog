/**
 * Stripe Checkout for a one-time "buy me a coffee" tip — no SDK dependency.
 *
 * Configure either:
 *   NEXT_PUBLIC_STRIPE_PAYMENT_LINK  — opens Stripe's hosted payment link (simplest)
 * or
 *   STRIPE_SECRET_KEY + STRIPE_COFFEE_PRICE_ID  — server creates a Checkout session
 */

export function stripePaymentLink(): string | null {
  const link = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK?.trim();
  return link && link.length > 0 ? link : null;
}

export async function createCoffeeCheckoutSession(): Promise<string | null> {
  const existing = stripePaymentLink();
  if (existing) return existing;

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const priceId = process.env.STRIPE_COFFEE_PRICE_ID?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

  if (!secret || !priceId) return null;

  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${siteUrl}/support/thanks`,
    cancel_url: siteUrl,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    console.error("support: Stripe checkout session failed:", await response.text());
    return null;
  }

  const payload = (await response.json()) as { url?: string | null };
  return payload.url ?? null;
}
