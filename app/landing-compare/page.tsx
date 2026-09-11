import type { Metadata } from "next";

import { CompareSlider } from "@/components/marketing/landing/compare-slider";
import { LandingPage } from "@/components/marketing/landing";
import { VibeLanding } from "@/components/marketing/landing/vibe-landing";

/**
 * TEMPORARY. The shipped landing page on the left, a one-shot redesign on
 * the right, and a wipe between them. Exists to look at, not to link to.
 * Delete this directory, `compare-slider.tsx`, `vibe-landing.tsx`, and the
 * `/landing-compare` line in `lib/onboarding/guest-gate.ts` together.
 */
export const metadata: Metadata = {
  title: "Landing page: before and after",
  robots: { index: false, follow: false },
};

export default function LandingComparePage() {
  return <CompareSlider before={<LandingPage />} after={<VibeLanding />} />;
}
