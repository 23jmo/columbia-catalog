import Link from "next/link";
import { RiArrowRightUpLine } from "@remixicon/react";

import { BookmarkControls } from "@/components/bookmarks/bookmark-controls";
import { EnrollmentBar } from "@/components/catalog/enrollment-bar";
import { formatSectionMeetings } from "@/components/catalog/meetings";
import { provenanceLabel } from "@/components/course/format";
import { formatCourseId } from "@/lib/requirements/code";
import { displayCourseTitle } from "@/lib/onboarding/course-title";
import type { FeedCard as FeedCardData, FeedSectionView } from "@/lib/recommend/feed";
import type { RecommendationCaveat, RecommendationReason } from "@/lib/recommend/types";
import { cx } from "@/utils/cx";

/**
 * One section, as a card.
 *
 * ── A section, not a course ────────────────────────────────────────────────
 *
 * The card used to be a course with its best section nested inside it and a
 * "4 other sections" disclosure underneath. That is the shape of a catalog
 * entry, and a catalog entry is not a thing anyone can do — you cannot register
 * for COMS W4111, you register for section 001, call number 14501, Gravano,
 * Tuesday and Thursday at 1:10. So the card is that, and the course page behind
 * the title is where the other sections live. One decision per card.
 *
 * ── Five lines, and every one of them is a fact you would act on ───────────
 *
 * The previous version printed the reason chips, the section topic, the
 * instructor, the meeting pattern, an estimate disclaimer, a provenance
 * sentence, a disclosure summary and the registrar's full prerequisite advisory
 * — up to two hundred words on a card whose job is to be glanced at. It was
 * accurate and unreadable, which for a card in a scrolling rail is the same as
 * being wrong.
 *
 * What survived: why it is here, what it is, who teaches it, when it meets, and
 * how full it is. Everything cut is one tap away on the course page behind the
 * title.
 *
 * ── The two actions are icons in the corner ────────────────────────────────
 *
 * Save, and open in Vergil. Both were full-width controls along the bottom,
 * which gave "leave this app" more weight than the class it was about. The
 * card's subject is the section; the actions are what you do after you have
 * read it, and they are one tap either way whether or not they carry a word.
 */

export function FeedCardView({ card, className }: { card: FeedCardData; className?: string }) {
  const section = card.best;

  /*
   * `displayCourseTitle`, not `prettyTitle`: the latter renders "CALCULUS III"
   * as "Calculus Iii" and "INTRODUCTION TO AI" as "Introduction to Ai".
   */
  const title = displayCourseTitle(card.title);
  const reason = card.reasons.map(reasonLine).find(Boolean) ?? null;
  const sectionHref = `/course/${card.courseId}?section=${encodeURIComponent(section.sectionCode)}`;

  return (
    <article
      className={cx(
        "flex flex-col gap-3 rounded-2xl border border-border-table",
        "bg-background-primary-default p-4",
        className,
      )}
    >
      <header className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {reason ? (
            <p className="truncate text-caption-1-medium text-accent-600">{reason}</p>
          ) : null}

          {/*
            The title links to the course page, not to Vergil. Vergil is where
            you register; this is where you decide, and the other sections, the
            full prerequisite text and the reviews are all there.
          */}
          <h3 className="text-title-3-semibold -tracking-[0.01em] text-text-primary">
            <Link
              href={sectionHref}
              className={cx(
                "line-clamp-2 rounded-sm outline-none transition-colors duration-100 ease",
                "hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              )}
            >
              {title}
            </Link>
          </h3>

          {/*
            Section before credits, and no credits at all.

            This line truncates on a 22rem card, and what it was dropping was
            the section number — on a card whose whole subject is one section.
            Credits went instead: they are on the course page, they are the same
            for every section of a course, and nobody chooses between two
            classes on 3 versus 2.5 points. The term stays because the feed
            spans two of them.
          */}
          <p className="truncate text-caption-1-regular tabular-nums text-text-tertiary">
            {card.code} · Sec {section.sectionCode} · {section.termLabel}
          </p>
        </div>

        {/*
          Both actions in the corner, as icons.

          The Vergil link used to be a full-width button across the bottom of
          the card, which made "leave this app" the most prominent thing on a
          card about a class. It is still the legitimacy proof — one click to
          the registrar's own page for this exact call number verifies
          everything above it — but it is a way out, not the subject, and a way
          out belongs in the corner. The accessible name carries the whole
          sentence, so nothing is lost to anyone reading with a screen reader.

          It opens in a new tab, where their UNI login and their own click do
          the work. We never register, drop, or waitlist anyone.
        */}
        <div className="flex shrink-0 items-center gap-0.5">
          <BookmarkControls
            sectionId={section.sectionId}
            sectionCode={section.sectionCode}
            courseLabel={card.code}
            size="xs"
          />
          <a
            href={section.vergilUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Vergil"
            aria-label={`Open ${card.code} section ${section.sectionCode}, call number ${section.callNumber}, in Vergil`}
            className={cx(
              "flex size-7 shrink-0 items-center justify-center rounded-lg",
              "text-foreground-icon-tertiary transition-colors",
              "hover:bg-background-primary-hover hover:text-text-primary",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiArrowRightUpLine aria-hidden className="size-4" />
          </a>
        </div>
      </header>

      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-body-2-medium text-text-secondary">
          {instructorLine(section) ?? (
            <span className="text-text-tertiary">Instructor not yet announced</span>
          )}
        </p>
        <TimeLine section={section} />
      </div>

      {/*
        Spec §3 asks that a seat number never render without the directory's own
        stamp, and the printed line under the meter was where it lived. The
        owner cut that line (2026-08-25) — it was a third grey sentence on a card
        whose job is to be glanced at — so the timestamp moved onto the meter as
        its title instead. It is still attached to the number and still reachable
        on hover and on the course page; it is no longer competing with the class
        for the reader's attention.
      */}
      <Footnote section={section} caveats={card.caveats} />

      {/*
        `mt-auto` is what makes a rail of cards readable rather than a row of
        boxes. Cards stretch to the tallest in the run, so without it each
        meter sits wherever its own card's text happened to end and the reader
        has to find the bar again on every card. Pinned to the bottom they land
        on one line, and "which of these has room" becomes a single glance
        across instead of five separate readings.
      */}
      <div title={seatProvenanceTitle(section.sourceAsOf)} className="mt-auto min-w-0">
        <EnrollmentBar
          status={section.status}
          enrollmentCount={section.enrollmentCount}
          enrollmentCap={section.enrollmentCap}
          waitlistCount={section.waitlistCount}
          className="min-w-0"
        />
      </div>
    </article>
  );
}

/* ==========================================================================
 * Lines
 * ========================================================================== */

/** Real names only — the registrar writes "TBA" into this field. */
function instructorLine(section: FeedSectionView): string | null {
  const names = section.instructors.filter(
    (name) => name.trim().length > 0 && !/^(tba|tbd)$/i.test(name.trim()),
  );
  return names.length > 0 ? names.join(", ") : null;
}

/**
 * When it meets — in three states, never two.
 *
 * 44.8% of sections have no published meeting pattern, and printing a
 * historical one without saying so is the single most damaging thing this
 * surface could do: a student would build a week around last year's schedule.
 * The estimate therefore names the term it came from, inline and in the warning
 * hue, and "not published" is stated outright rather than left as a blank row.
 */
function TimeLine({ section }: { section: FeedSectionView }) {
  if (section.timeKind === "tba") {
    return (
      <p className="truncate text-body-2-regular text-text-tertiary">
        Meeting time not published
      </p>
    );
  }

  const meeting = formatSectionMeetings(section);
  if (!meeting) {
    return (
      <p className="truncate text-body-2-regular text-text-tertiary">
        Meeting time not published
      </p>
    );
  }

  if (section.timeKind === "estimated") {
    return (
      <p className="truncate text-body-2-regular tabular-nums text-status-yellow-text">
        {meeting} · estimated, not confirmed
      </p>
    );
  }

  return (
    <p className="truncate text-body-2-regular tabular-nums text-text-tertiary">{meeting}</p>
  );
}

/**
 * The one disclosure that cannot be dropped, in a single quiet line.
 *
 * We could not parse the prerequisite sentence for about 43% of the catalog,
 * and a card that stays silent about that is presenting an uncertainty as a
 * fact. It is three words here and the registrar's full wording on the course
 * page, which is where a student who is actually about to register is going
 * anyway.
 *
 * A plan clash joins it when there is one: same kind of statement — something
 * true about this section that the numbers above do not show — and short enough
 * to belong on the same line rather than in a box of its own.
 */
function Footnote({
  section,
  caveats,
}: {
  section: FeedSectionView;
  caveats: readonly RecommendationCaveat[];
}) {
  const clashes = section.conflictsWithPlan;
  const unverified = caveats.some((caveat) => caveat.kind === "prereq_unknown");
  if (!clashes && !unverified) return null;

  return (
    <p className="truncate text-caption-1-regular text-text-tertiary">
      {clashes ? <span className="text-status-rose-text">Clashes with your plan</span> : null}
      {clashes && unverified ? " · " : null}
      {unverified ? "Prerequisites unverified" : null}
    </p>
  );
}

/**
 * The directory's own reading time, as a hover title on the meter.
 *
 * A seat count is a reading, not a live number, and detaching it from when it
 * was taken is how "23 seats left" becomes something a student believes on
 * registration morning. The line that said so in print is gone by owner
 * decision; this keeps the two together for anyone who goes looking, and the
 * course page still states it outright.
 */
function seatProvenanceTitle(sourceAsOf: string | null): string | undefined {
  const label = provenanceLabel(sourceAsOf);
  return label ? `Seat counts read from the directory ${label}` : undefined;
}

/* ==========================================================================
 * The reason
 * ========================================================================== */

/**
 * Why this card is here, in one clause.
 *
 * ── One reason, not all of them ────────────────────────────────────────────
 *
 * The engine can return several, and the card shows the first — they arrive
 * ranked, so the first is the strongest. Printing three chips made the reasons
 * the loudest thing on a card whose subject is a class, and a student who reads
 * "clears the Global Core" has already got what they came for.
 *
 * ── The kinds stay apart, and the verb is what keeps them apart ────────────
 *
 * "It clears the Global Core" and "you might like it" are different claims with
 * different consequences, and `RecommendationReason` keeps them distinct on
 * purpose. Collapsing them into one relevance score — a number, a star rating,
 * one undifferentiated chip — is the exact move that turns a recommender into
 * decoration: the student cannot tell whether the app is talking about their
 * degree or their taste, so they stop trusting it about both. The distinction
 * survives here as the verb, which costs no ink at all.
 *
 * Codes are named rather than counted wherever one will fit, because "because
 * the model says so" is not a reason anyone can argue with — and being able to
 * argue with it is what makes it useful. If the named course is wrong, the
 * student knows to go fix their record.
 */
function reasonLine(reason: RecommendationReason): string | null {
  switch (reason.kind) {
    case "required":
      return `Clears ${reason.groupLabel}`;
    case "interesting_and_counts":
      return `Your kind of thing — clears ${reason.groupLabel}`;
    case "because_you_took":
      return `Like ${andMore(reason.similarTo)}`;
    /*
     * `unlocks` is computed and deliberately not printed (owner decision,
     * 2026-08-25). "Opens up PSYC UN1450 +2" asks the reader to hold three
     * course codes they have never seen in order to evaluate a fourth, which is
     * work, and on a cold feed it was the reason on almost every card — so it
     * read as boilerplate rather than as a reason. It still earns the course its
     * place in the ranking; it just does not spend a line saying so.
     */
    case "unlocks":
      return null;
  }
}

/** `"COMS W3134"`, or `"COMS W3134 +2"`. Printed form, never the stored id. */
function andMore(courseIds: readonly string[]): string {
  const [first, ...rest] = courseIds;
  if (!first) return "";
  return rest.length > 0 ? `${formatCourseId(first)} +${rest.length}` : formatCourseId(first);
}
