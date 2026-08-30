import type { Metadata } from "next";

import { JsonLd } from "@/components/marketing/json-ld";
import { faqPageJsonLd, organizationWebsiteGraph } from "@/lib/marketing/json-ld";
import { FAQ_ITEMS } from "@/lib/marketing/faq";
import { publicPageMetadata } from "@/lib/marketing/site";

export const metadata: Metadata = publicPageMetadata({
  title: "LionPlan FAQ: Columbia College and SEAS course planner",
  description:
    "Short answers: what LionPlan is, which schools it supports, how it differs from Stellic and Vergil, and whether it replaces your CSA adviser.",
  path: "/faq",
});

/**
 * Citation-ready answers for search and answer engines.
 *
 * One question, one paragraph. The same strings are emitted as FAQPage
 * JSON-LD so a crawler does not have to guess.
 */
export default function FaqPage() {
  return (
    <>
      <JsonLd data={organizationWebsiteGraph()} />
      <JsonLd data={faqPageJsonLd()} />
      <header className="flex flex-col gap-3">
        <h1 className="text-display-4-semibold -tracking-[0.02em] text-text-primary">
          FAQ
        </h1>
        <p className="text-headline-regular text-pretty text-text-secondary">
          LionPlan is a Columbia course planner for Columbia College and
          Columbia Engineering. The short answers are below.
        </p>
      </header>
      <dl className="flex flex-col gap-8">
        {FAQ_ITEMS.map((item) => (
          <div key={item.question} className="flex flex-col gap-2">
            <dt className="text-title-3-semibold text-text-primary">
              {item.question}
            </dt>
            <dd className="text-headline-regular text-pretty text-text-secondary">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
