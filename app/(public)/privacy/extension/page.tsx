import type { Metadata } from "next";

import { PublicSection } from "@/components/marketing/public-doc";

export const metadata: Metadata = {
  title: "Extension privacy · LionPlan",
  description:
    "Privacy policy for the LionPlan schedule-refresh browser extension. It reads public meeting times. It does not read your transcript.",
};

/**
 * Chrome Web Store listing URL. The store page already points here
 * (`https://www.lionplan.org/privacy/extension`). The guest gate must
 * allow `/privacy/*` or reviewers land on the school picker.
 */
export default function ExtensionPrivacyPage() {
  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="text-display-4-semibold -tracking-[0.02em] text-text-primary">
          Schedule refresh privacy
        </h1>
        <p className="text-body-regular text-text-tertiary">
          Effective August 24, 2026
        </p>
      </header>

      <PublicSection title="Single purpose">
        <p>
          This extension helps keep LionPlan course schedules current by
          capturing the public course times and locations already returned
          by Vergil course search.
        </p>
      </PublicSection>

      <PublicSection title="What it processes">
        <p>
          It processes course identifiers, term and section codes, call
          numbers, meeting days, times, building and room labels, and the
          time each result was observed. Captures stay in Chrome session
          storage and disappear when the browser session ends or when you
          choose Clear.
        </p>
      </PublicSection>

      <PublicSection title="What it never accesses">
        <p>
          It does not read passwords, bearer tokens, request headers,
          cookies, browser history, planner or schedule records,
          registration actions, grades, holds, financial information, or
          any other personal academic record. It never sends a request to a
          Columbia API and never performs a registration action.
        </p>
      </PublicSection>

      <PublicSection title="Sharing and consent">
        <p>
          Sharing is off by default. If you turn on help keeping the
          catalog current, only the signed-in LionPlan site may request the
          sanitized capture, and only after you review it. No data is sold,
          used for advertising, or transferred for another purpose.
        </p>
      </PublicSection>

      <PublicSection title="Limited Use">
        <p>
          Use of information received through this extension follows the
          Chrome Web Store User Data Policy, including the Limited Use
          requirements. Data is used only to provide and improve the
          extension&rsquo;s disclosed schedule-refresh purpose.
        </p>
      </PublicSection>
    </>
  );
}
