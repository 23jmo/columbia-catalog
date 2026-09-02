import { JsonLd } from "@/components/marketing/json-ld";
import {
  organizationWebsiteGraph,
  softwareApplicationJsonLd,
} from "@/lib/marketing/json-ld";

import { displaySerif } from "./landing-fonts";
import { LandingAdvisor } from "./landing-advisor";
import { LandingClosingCta, LandingFooter } from "./landing-footer";
import { LandingFaq } from "./landing-faq";
import { LandingHero } from "./landing-hero";
import {
  LandingCatalogSplit,
  LandingHowItHelps,
  LandingSetup,
} from "./landing-sections";

/**
 * What `/` renders for a visitor with no session.
 *
 * ── Why this lives at `/` and not at `/welcome` ────────────────────────────
 *
 * The apex is where organic traffic, shared links, and anyone typing the name
 * arrive. A landing page one redirect away from that is one most of its
 * audience never reaches, and it splits the ranking signal between two URLs
 * saying the same thing. So `/` branches on session instead: this for a
 * guest, the feed for a student.
 *
 * The cost is worth naming honestly: `/` can no longer carry
 * `PUBLIC_CACHE_CONTROL`, because deciding which of the two to render means
 * calling `getUser()`, and `getUser()` marks the response `private,
 * no-store`. `/about` stays the fully cacheable public page. This one trades
 * a CDN hit for being at the address people actually type.
 *
 * ── Section order ─────────────────────────────────────────────────────────
 *
 * Hero, then proof, then mechanism, then objections, then the ask:
 *
 *   1. Hero — the claim, and a product shot that demonstrates it
 *   2. How it helps — the two things a catalog cannot do on its own
 *   3. Setup — the wizard guesses the transcript so the reader knows "Get my
 *      list" is a correction, not a form
 *   4. Advisor — one real turn of `/chat`, for the questions a ranked list
 *      cannot anticipate. This replaced a four-card capability grid; see the
 *      note at the top of `landing-advisor.tsx`.
 *   5. Catalog split — the guest-open door, with the numbers behind it
 *   6. FAQ — the objections we are willing to name
 *   7. Closing CTA — the same two buttons as the hero
 *
 * ── The frame is local, and so is the serif ────────────────────────────────
 *
 * `AppShell` is the signed-in chrome — sidebar, catalog rail, account popover
 * — none of which means anything to someone who has not started, and half of
 * which renders padlocks. `(public)/layout.tsx` is the other existing frame,
 * and it is a prose column sized for `/about`; a full-bleed hero inside a
 * 46-character measure is not a landing page. So this composes its own
 * header and footer.
 *
 * `displaySerif.variable` is set here rather than in `app/layout.tsx` so the
 * face is requested by this route only — see `landing-fonts.ts`.
 *
 * ── Structured data: two graphs, not three ─────────────────────────────────
 *
 * Organization/WebSite and SoftwareApplication describe the site and the
 * product, so they belong on the page a crawler is most likely to treat as
 * canonical. FAQPage is deliberately absent even though five questions render
 * here — see the note in `landing-faq.tsx`.
 */
export function LandingPage() {
  return (
    <div
      className={`${displaySerif.variable} flex min-h-dvh flex-col bg-background-full`}
    >
      <JsonLd data={organizationWebsiteGraph()} />
      <JsonLd data={softwareApplicationJsonLd()} />

      <main className="flex flex-1 flex-col">
        <LandingHero />
        <LandingHowItHelps />
        <LandingSetup />
        <LandingAdvisor />
        <LandingCatalogSplit />
        <LandingFaq />
        <LandingClosingCta />
      </main>

      <LandingFooter />
    </div>
  );
}
