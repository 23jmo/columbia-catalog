import type { Metadata } from "next";

import { PublicSection } from "@/components/marketing/public-doc";
import { publicPageMetadata } from "@/lib/marketing/site";

export const metadata: Metadata = publicPageMetadata({
  title: "Terms · LionPlan, a Columbia and Barnard course planner",
  description:
    "LionPlan is an unofficial student project. It is a companion to Stellic and Vergil, not a replacement, and not a substitute for CSA or Barnard advising.",
  path: "/terms",
});

/**
 * Terms of use. Same guest-gate requirement as /privacy: this URL has to
 * render without an account. Keep the claims aligned with the live
 * product: Columbia College, Columbia Engineering and Barnard College.
 * No user counts. No official-affiliation language, for Columbia or for
 * Barnard — Barnard requirements come from `catalog.barnard.edu`, which
 * makes the disclaimer apply to two institutions, not one.
 */
export default function TermsPage() {
  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="text-display-4-semibold -tracking-[0.02em] text-text-primary">
          Terms of use
        </h1>
        <p className="text-body-regular text-text-tertiary">
          Last updated August 30, 2026
        </p>
      </header>

      <PublicSection title="Unofficial project">
        <p>
          LionPlan is an unofficial student project. It is not affiliated
          with, endorsed by, or a product of Columbia University or Barnard
          College.
        </p>
      </PublicSection>

      <PublicSection title="What the site is">
        <p>
          The site helps Columbia College, Columbia Engineering and Barnard
          College students see what their bulletin or catalogue requires and
          what they might take next. General Studies is listed as coming
          soon and is not available yet.
        </p>
        <p>
          It is not a registrar. It is not official degree-audit software.
          It is not a substitute for Stellic, Vergil, or advising at CSA or
          Barnard. Course offerings, seats, and bulletin and catalogue rules
          change. Confirm everything with your school before you register.
        </p>
      </PublicSection>

      <PublicSection title="Accounts">
        <p>
          You can read the public pages and walk through setup without an
          account. Saving a plan requires signing in with a Columbia or
          Barnard Google account. You are responsible for the accuracy of
          the coursework you enter or import.
        </p>
      </PublicSection>

      <PublicSection title="Acceptable use">
        <p>
          Do not use the site to register, drop, or waitlist anyone. Do not
          try to collect another student&rsquo;s record. Do not treat
          scraped catalog pages as something you may republish as your own
          official bulletin.
        </p>
      </PublicSection>

      <PublicSection title="No warranty">
        <p>
          The site is provided as is. A recommendation can be wrong, a
          requirement can be incomplete, and a seat count can be stale. We
          may change or remove the service.
        </p>
      </PublicSection>
    </>
  );
}
