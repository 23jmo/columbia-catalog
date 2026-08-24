import Link from "next/link";
import { RiArrowRightSLine } from "@remixicon/react";

import { creditsLabel, prettyTitle } from "@/components/course/format";
import { CourseSubjectIcon } from "@/components/course/subject-icon";
import type { FeedCard as FeedCardData } from "@/lib/recommend/feed";
import { cx } from "@/utils/cx";

import { CaveatNotes, ReasonChips } from "./reason-chips";
import { SectionLine } from "./section-line";

/**
 * One recommendation, as a card.
 *
 * ── One card per course, showing its best section ──────────────────────────
 *
 * The card is about a SECTION — the instructor and the time slot are most of
 * the decision, and bookmarks are already section-level — but there is exactly
 * one card per course. COMS W1004 has twelve sections; twelve cards for one
 * course would push every other recommendation off the first screen and turn a
 * feed into a section listing. The siblings live in a disclosure underneath,
 * which is the honest compromise: nothing is hidden, but the scan is over
 * courses.
 *
 * ── Why the disclosure is a `<details>` ────────────────────────────────────
 *
 * It is the whole interaction, it works before hydration, it keeps this a
 * server component, and it means a feed of twelve cards ships no JavaScript of
 * its own. A `useState` toggle would have cost a client boundary per card for a
 * behaviour the platform already has.
 *
 * ── Chrome is borrowed, not invented ───────────────────────────────────────
 *
 * The card surface, the subject icon, the seat pill and its provenance stamp
 * are the course page's, unchanged. A feed that styled its own version of a
 * seat count would drift from the page it links to, and the reader would have
 * to learn the same fact twice.
 */

export function FeedCardView({
  card,
  className,
}: {
  card: FeedCardData;
  className?: string;
}) {
  const subjectCode = card.code.split(" ")[0] ?? "";
  const title = prettyTitle(card.title);
  const credits = creditsLabel(card.points, card.points);
  const otherCount = card.others.length;

  return (
    <article
      className={cx(
        "flex flex-col gap-3.5 rounded-[20px] border border-border-table bg-background-primary-default p-4 shadow-card sm:p-5",
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <CourseSubjectIcon subjectCode={subjectCode} variant="inline" />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-caption-1-medium text-text-tertiary">
            <span className="font-mono tabular-nums text-text-secondary">{card.code}</span>
            {credits ? <span>· {credits}</span> : null}
          </p>
          {/*
            The title is the link, and it goes to the course page rather than to
            Vergil. Vergil is where you register; this is where you decide, and
            conflating the two would send a student off-site before they had
            read anything.
          */}
          <h3 className="mt-0.5 text-title-3-semibold -tracking-[0.01em] text-text-primary">
            <Link
              href={`/course/${card.courseId}`}
              className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              {title}
            </Link>
          </h3>
        </div>
      </header>

      <ReasonChips reasons={card.reasons} />

      <SectionLine section={card.best} courseCode={card.code} variant="primary" />

      {otherCount > 0 ? (
        <details className="group">
          <summary
            className={cx(
              "flex cursor-pointer list-none items-center gap-1 rounded-md py-0.5",
              "text-caption-1-medium text-text-secondary",
              "outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiArrowRightSLine
              className="size-3.5 shrink-0 transition-transform duration-150 ease group-open:rotate-90 motion-reduce:transition-none"
              aria-hidden
            />
            and {otherCount} other {otherCount === 1 ? "section" : "sections"}
          </summary>
          <div className="mt-1 flex flex-col">
            {card.others.map((section) => (
              <SectionLine
                key={section.sectionId}
                section={section}
                courseCode={card.code}
                variant="sibling"
              />
            ))}
          </div>
        </details>
      ) : null}

      <CaveatNotes caveats={card.caveats} />
    </article>
  );
}
