import Link from "next/link";
import { RiArrowRightUpLine } from "@remixicon/react";

import { BookmarkControls } from "@/components/bookmarks/bookmark-controls";
import { EnrollmentChip } from "@/components/course/enrollment-chip";
import { InstructorChip } from "@/components/course/instructor-chip";
import { WeekStrip } from "@/components/course/meeting-schedule";
import { meetingLines } from "@/components/course/format";
import { InstructorLink, InstructorLinks, isLinkableInstructor } from "@/components/instructor/instructor-link";
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
 * You cannot register for COMS W4111. You register for section 001, call
 * number 14501, Gravano, Tuesday and Thursday at 1:10. The card is that
 * decision. The course page behind the title is where the other sections live.
 *
 * ── Rank the facts, do not grey them equally ───────────────────────────────
 *
 * A rail of cards is glanced at, not read. The questions, in the order they
 * are actually asked:
 *
 *   1. Is this the right class?  → title, in primary
 *   2. Does it fit my week?      → a week strip, then the clock, also primary
 *   3. Who teaches it?           → the same instructor chip the drawer uses
 *   4. Can I still get in?       → "N seats left", with the history on hover
 *   5. Why is it here?           → one quiet clause, not a glowing truncated pill
 *
 * Everything that used to be caption-2 tertiary — the code line, the time,
 * the instructor, the unverified footnote — was the same grey weight, which
 * is how a card full of facts becomes a card nobody reads. Grey is for the
 * eyebrow. The facts you act on are the same colour as the title.
 *
 * ── Hover previews, not native `title` tooltips ────────────────────────────
 *
 * The drawer already has this: `InstructorChip` loads ratings on first open,
 * `EnrollmentChip` loads the seat history. The feed was printing the same
 * names and numbers as inert grey, so a student who had learned that a name
 * is a preview anywhere else had unlearned it here. Same components, same
 * delay, same charts — the rail is a search hit someone chose for you.
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
        // `min-w-0` keeps a phone column from expanding to the card's
        // intrinsic min-content (week strip + seat chip + corner icons).
        "flex min-w-0 w-full flex-col gap-3 rounded-2xl border border-border-table",
        "bg-background-primary-default p-4",
        "transition-colors duration-150 ease-out motion-reduce:transition-none",
        "hover:border-border-button-hover",
        className,
      )}
    >
      <header className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/*
            Section before credits, and no credits at all.

            This line truncates on a 22rem card, and what it was dropping was
            the section number — on a card whose whole subject is one section.
            Credits went instead: they are on the course page, they are the same
            for every section of a course, and nobody chooses between two
            classes on 3 versus 2.5 points. The term stays because the feed
            spans two of them.
          */}
          <p className="truncate text-caption-1-medium tabular-nums text-text-secondary">
            {card.code} · Sec {section.sectionCode} · {section.termLabel}
          </p>

          {/*
            The title links to the course page, not to Vergil. Vergil is where
            you register; this is where you decide, and the other sections, the
            full prerequisite text and the reviews are all there.
          */}
          {/*
            One line, always. A rail of mixed 1- and 2-line titles makes every
            card a different height above the week strip, so the clocks and
            seat meters refuse to line up. Truncate the long ones; the full
            name is on the course page the title already links to.
          */}
          <h3 className="min-w-0 overflow-hidden text-headline-semibold -tracking-[0.01em] text-text-primary">
            <Link
              href={sectionHref}
              className={cx(
                "block truncate whitespace-nowrap rounded-sm outline-none",
                "transition-colors duration-100",
                "hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              )}
            >
              {title}
            </Link>
          </h3>

          {reason ? (
            <p className="line-clamp-1 text-caption-1-medium text-accent-700" title={reason}>
              {reason}
            </p>
          ) : null}
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
              "text-foreground-icon-tertiary transition-colors duration-150",
              "hover:bg-background-primary-hover hover:text-text-primary",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiArrowRightUpLine aria-hidden className="size-4" />
          </a>
        </div>
      </header>

      <TimeLine section={section} />
      <Teachers section={section} />
      <Footnote section={section} caveats={card.caveats} />

      {/*
        `mt-auto` is what makes a rail of cards readable rather than a row of
        boxes. Cards stretch to the tallest in the run, so without it each
        meter sits wherever its own card's text happened to end and the reader
        has to find the bar again on every card. Pinned to the bottom they land
        on one line, and "which of these has room" becomes a single glance
        across instead of five separate readings.

        The chip, not a wrapped `EnrollmentBar`. The bar was a decoration with
        a native `title` tooltip; this is the same control the drawer uses, so
        hovering it loads the seat history and a touch toggles the card. The
        course page is still one tap away on the title.
      */}
      <EnrollmentChip
        section={section}
        termLabel={section.termLabel}
        hideProvenance
        fill
        compact
        placement="top"
        className="mt-auto"
      />
    </article>
  );
}

/* ==========================================================================
 * Lines
 * ========================================================================== */

/** Real names only — the registrar writes empty strings into this field. */
function teachers(section: FeedSectionView): string[] {
  return section.instructors.filter((name) => name.trim().length > 0);
}

/**
 * When it meets — drawn, then named.
 *
 * "TuTh 1:10pm-2:25pm" in caption-2 tertiary is a string a reader has to
 * parse, in a colour they have already learned to skip. The week strip is
 * answered by shape before any reading happens, which is the question every
 * student is actually asking: does this collide with what I already have.
 *
 * 44.8% of sections have no published meeting pattern, and printing a
 * historical one without saying so is the single most damaging thing this
 * surface could do: a student would build a week around last year's schedule.
 * The estimate therefore names itself, in the warning hue, and "not published"
 * is stated outright rather than left as a blank row.
 */
function TimeLine({ section }: { section: FeedSectionView }) {
  if (section.timeKind === "tba") {
    return (
      <p className="text-body-medium text-text-secondary">Meeting time not published</p>
    );
  }

  const lines = meetingLines(section.meetings);
  const primary = lines[0];
  if (!primary) {
    return (
      <p className="text-body-medium text-text-secondary">Meeting time not published</p>
    );
  }

  const extra = lines.length - 1;
  const estimated = section.timeKind === "estimated";

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <WeekStrip days={primary.days} />
      <p
        className={cx(
          "min-w-0 truncate text-headline-medium tabular-nums",
          estimated ? "text-status-yellow-text" : "text-text-primary",
        )}
      >
        {primary.timeLabel}
        {extra > 0 ? ` · +${extra}` : ""}
        {estimated ? " · estimated" : ""}
      </p>
    </div>
  );
}

/**
 * Who teaches it — the same chip the section drawer uses.
 *
 * A grey `InstructorLinks` string told you the name and hid that a hover
 * exists. The chip is the name, a star, and the ratings card; click the name
 * for the profile, hover anywhere on the chip for the preview. Co-teachers
 * stay a trailing count so two avatars do not double the card's height.
 */
function Teachers({ section }: { section: FeedSectionView }) {
  const names = teachers(section);
  const primary = names[0];
  const rest = names.slice(1);

  if (!primary) {
    return (
      <p className="text-body-medium text-text-secondary">Instructor not yet announced</p>
    );
  }

  if (!isLinkableInstructor(primary)) {
    return (
      <p className="truncate text-body-medium text-text-secondary">
        <InstructorLinks names={names} max={2} fallback="Instructor not yet announced" />
      </p>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <InstructorChip
        name={primary}
        role={`Section ${section.sectionCode}`}
        placement="top"
        className="-ml-0.5 min-w-0"
      />
      {rest.length > 0 ? (
        <span className="min-w-0 truncate text-caption-1-medium text-text-secondary">
          {rest.length === 1 ? (
            <>
              · <InstructorLink name={rest[0]!} />
            </>
          ) : (
            `+${rest.length}`
          )}
        </span>
      ) : null}
    </div>
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
    <p className="truncate text-caption-1-medium">
      {clashes ? <span className="text-status-rose-text">Clashes with your plan</span> : null}
      {clashes && unverified ? " · " : null}
      {unverified ? <span className="text-text-secondary">Prerequisites unverified</span> : null}
    </p>
  );
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
      return `Satisfies ${reason.groupLabel}`;
    case "interesting_and_counts":
      /*
       * The requirement leads, and the taste half trails, because the line
       * truncates at the card's width and the half that survives should be the
       * one with a consequence in it. "Satisfies the Science requirement …" is
       * still an answer; "Your kind of thing · satisfies the Sci…" is not.
       */
      return `Satisfies ${reason.groupLabel} · your kind of thing`;
    case "because_you_took":
      return `Because you took ${andMore(reason.similarTo)}`;
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
