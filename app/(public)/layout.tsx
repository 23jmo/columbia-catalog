import type { ReactNode } from "react";

import { PublicDoc } from "@/components/marketing/public-doc";

/**
 * Shared frame for /about, /privacy, and /terms.
 *
 * A route group so the URLs stay flat. Guests are allowed through
 * `isGuestAllowedPath` in `lib/onboarding/guest-gate.ts`; without that
 * allow-list this layout would never paint, because `proxy.ts` would 307
 * the request to /onboarding first.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicDoc>{children}</PublicDoc>;
}
