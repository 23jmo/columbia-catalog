import { redirect } from "next/navigation";

import { createCoffeeCheckoutSession } from "@/lib/support/stripe-checkout";

/** Starts Stripe Checkout for a one-time tip. */
export async function GET() {
  const url = await createCoffeeCheckoutSession();
  if (!url) {
    redirect("/?support=unavailable");
  }
  redirect(url);
}
