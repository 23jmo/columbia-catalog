import Link from "next/link";
import { RiArrowRightSLine } from "@remixicon/react";

import { creditsLabel } from "@/components/course/format";
import { displayCourseTitle } from "@/lib/onboarding/course-title";
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
 * ── One box, and rules instead of boxes ────────────────────────────────────
 *
 * Every part of this card used to arrive in its own container: a tinted panel
 * around the chosen section, four coloured chips above it, a pill around the
 * seat count, a bordered box around the caveat. Four nested surfaces to say
 * four things about one class, and the reader had to work out the nesting
 * before they could read any of it.
 *
 * There is one border now — the card — and the internal structure is carried
 * by hairlines and by type. That is not just tidier: the card sits inside a
 * chat thread underneath a paragraph of the assistant's prose, and a stack of
 * heavily-chromed cards under a plain paragraph reads as advertising rather
 * than as the answer. It should read as the continuation of the sentence above
 * it, with exactly one thing to press.
 *
 * ── Why the disclosure is a `<details>` ────────────────────────────────────
 *
 * It is the whole interaction, it works before hydration, it keeps this a
 * server component, and it means a feed of twelve cards ships no JavaScript of
 * its own. A `useState` toggle would have cost a client boundary per card for a
 * behaviour the platform already has.
 */

export function FeedCardView({
  card,
  className,
}: {
  card: FeedCardData;
  className?: string;
}) {
  // `displayCourseTitle`, not `prettyTitle`: the latter renders "CALCULUS III"
  // as "Calculus Iii" and "INTRODUCTION TO AI" as "Introduction to Ai". The
  // repairs and their reasoning live in `lib/onboarding/course-title.ts`.
  const title = displayCourseTitle(card.title);
  const credits = creditsLabel(card.points, card.points);
  const otherCount = card.others.length;

  return (
    <article
      className={cx(
        "flex flex-col gap-3 rounded-2xl border border-border-table",
        "bg-background-primary-default p-4",
        className,
      )}
    >
      <header className="min-w-0">

        {/*
          The title is the link, and it goes to the course page rather than to
          Vergil. Vergil is where you register; this is where you decide, and
          conflating the two would send a student off-site before they had read
          anything. It is set one weight above the assistant's prose rather
          than one size above it — the card is part of the answer, not a
          headline interrupting it.
        */}
        <h3 className="text-headline-semibold -tracking-[0.01em] text-text-primary">
          <Link
            href={`/course/${card.courseId}`}
            className="rounded-sm outline-none transition-colors duration-100 ease hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            {title}
          </Link>
        </h3>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-2-regular text-text-tertiary">
          <span className="tabular-nums tracking-[0.04em]">{card.code}</span>
          {credits ? <span>· {credits}</span> : null}
        </p>

        <ReasonChips reasons={card.reasons} className="mt-1" />
      </header>

      <div className="border-t border-border-table pt-3">
        <SectionLine section={card.best} courseId={card.courseId} courseCode={card.code} />
      </div>

      {otherCount > 0 ? (
        <details className="group border-t border-border-table pt-3">
          <summary
            className={cx(
              "flex cursor-pointer list-none items-center gap-1 rounded-md",
              "text-caption-1-regular text-text-tertiary",
              "outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiArrowRightSLine
              className="size-3.5 shrink-0 transition-transform duration-150 ease group-open:rotate-90 motion-reduce:transition-none"
              aria-hidden
            />
            {otherCount} other {otherCount === 1 ? "section" : "sections"}
          </summary>

          <ul className="flex flex-col">
            {card.others.map((section) => (
              <li
                key={section.sectionId}
                className="border-t border-border-table py-3 first:border-t-0 last:pb-0"
              >
                <SectionLine
                  section={section}
                  courseId={card.courseId}
                  courseCode={card.code}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <CaveatNotes caveats={card.caveats} className="border-t border-border-table pt-3" />
    </article>
  );
}
