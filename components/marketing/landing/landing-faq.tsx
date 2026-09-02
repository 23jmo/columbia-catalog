import Link from "next/link";
import { RiArrowDownSLine, RiArrowRightLine } from "@remixicon/react";

import { FAQ_ITEMS } from "@/lib/marketing/faq";

/**
 * The objection band — hairline rows, no cards.
 *
 * ── Why an accordion here and a plain list on /faq ─────────────────────────
 *
 * `/faq` exists to be quoted: one question, one paragraph, all open, and the
 * same strings emitted as FAQPage JSON-LD so an answer engine does not have
 * to guess. Collapsing it there would hide the text from a reader who came
 * specifically to read it.
 *
 * Here the job is the opposite. This visitor has not asked anything yet; they
 * are scanning for the one objection that would stop them, and eight open
 * paragraphs is a wall to scroll past. Collapsed, the questions read as a
 * list of objections we are willing to name — which is itself reassurance.
 *
 * ── `<details>` and not a state hook ───────────────────────────────────────
 *
 * The page is static and an accordion is the canonical case where the
 * platform element beats the React one: it opens with JavaScript disabled, it
 * is keyboard operable for free, and find-in-page can open a closed
 * `<details>` to reveal a match inside it.
 *
 * ── Only the first five, and no second FAQPage graph ───────────────────────
 *
 * Five is where the questions stop being objections ("is this official?",
 * "does it replace my adviser?") and start being disambiguation for people
 * already sold. Those belong on `/faq`, which the link below goes to.
 *
 * This section deliberately does NOT emit `faqPageJsonLd()`. `/faq` already
 * does, and the same FAQPage graph on two URLs asks Google to choose a
 * canonical between them — which risks it picking this page's copy for a
 * query `/faq` was written to win.
 */
export function LandingFaq() {
  return (
    <section className="mx-auto w-full max-w-[75rem] px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-10">
        <h2 className="text-balance text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-[1.12] tracking-[-0.03em] text-text-primary">
          FAQ
        </h2>

        <div className="flex flex-col">
          {FAQ_ITEMS.slice(0, 5).map((item) => (
            <details
              key={item.question}
              className="group border-t border-border-table last:border-b"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring [&::-webkit-details-marker]:hidden">
                <span className="text-pretty text-[1.0625rem] font-medium leading-[1.4] tracking-[-0.015em] text-text-primary">
                  {item.question}
                </span>
                <RiArrowDownSLine
                  className="size-5 shrink-0 text-text-tertiary transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="max-w-[62ch] text-pretty pb-6 text-[1rem] leading-[1.55] tracking-[-0.008em] text-text-secondary">
                {item.answer}
              </p>
            </details>
          ))}
        </div>

        {/*
          The accent and the arrow, matching the catalog link in the band above.
          In plain grey this read as a caption under the last row rather than as
          the way out of a truncated list — which is the one thing it is for.
        */}
        <Link
          href="/faq"
          className="inline-flex items-center gap-1.5 self-start rounded-lg text-[0.9375rem] font-medium tracking-[-0.01em] text-accent-600 outline-none transition-colors duration-150 hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Read all {FAQ_ITEMS.length} questions
          <RiArrowRightLine className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
