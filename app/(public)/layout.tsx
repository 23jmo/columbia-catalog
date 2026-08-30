import type { ReactNode } from "react";

import { PublicDoc } from "@/components/marketing/public-doc";

/**
 * Shared frame for /about, /faq, /privacy, and /terms.
 *
 * A route group so the URLs stay flat. Guests are allowed through
 * `isGuestAllowedPath` in `lib/onboarding/guest-gate.ts`; without that
 * allow-list this layout would never paint, because `proxy.ts` would 307
 * the request to /onboarding first.
 *
 * `revalidate` keeps these pages cacheable. Onboarding stays a cookie
 * page and keeps its own no-store.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicDoc>{children}</PublicDoc>;
}
