import Link from "next/link";
import {
  RiArrowRightUpLine,
  RiCheckboxCircleLine,
  RiRouteLine,
  RiSparkling2Line,
  RiStarFill,
} from "@remixicon/react";

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
import type { ReputationSummary } from "@/lib/types";
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

export function FeedCardView({
  card,
  className,
  readOnly = false,
}: {
  card: FeedCardData;
  className?: string;
  /**
   * Render the card without the save control.
   *
   * One caller: the landing page's product shot, which renders this component
   * for real rather than redrawing it, so the hero can never drift from the
   * card a student actually gets. Saving is a signed-in write, and mounting
   * `BookmarkControls` subscribes to the bookmark store — whose first read
   * fires a server action on mount. On `/` that round trip is guaranteed
   * waste: the page only renders for a visitor with no session, so the answer
   * is always `signed_out`, and it would land on the one page whose job is to
   * paint fast for a stranger who has not decided to stay.
   *
   * It hides the control rather than disabling it. A disabled star on a
   * marketing page is an affordance that teaches the visitor this page's
   * controls are decoration, directly under the button we want them to press.
   */
  readOnly?: boolean;
}) {
  const section = card.best;

  /*
   * `displayCourseTitle`, not `prettyTitle`: the latter renders "CALCULUS III"
   * as "Calculus Iii" and "INTRODUCTION TO AI" as "Introduction to Ai".
   */
  const courseTitle = displayCourseTitle(card.title);

  /*
   * On a container course the SECTION is the class, and the course title names
   * the container rather than anything the student would recognise.
   *
   * COMS 6998 is one course called "Topics in Computer Science" carrying 20
   * unrelated seminars; a card for section 012 headed "Topics in Computer
   * Science" is indistinguishable from the other nineteen, and the one string
   * that would tell them apart -- "Computation and the Brain" -- is on the
   * section. So the section's own name leads when it has one, exactly as it
   * does in the search table and the course drawer, and the course title drops
   * to the context line below so the reader still knows what it is part of.
   *
   * `card.best.title` is already null unless the feed decided the section names
   * a class of its own (see `toSectionView`), so this is a presence check
   * rather than a second opinion about the same string.
   */
  const ownTitle = section.title ? displayCourseTitle(section.title) : null;
  const title = ownTitle ?? courseTitle;
  const sectionHref = `/course/${card.courseId}?section=${encodeURIComponent(section.sectionCode)}`;

  return (
    <article
      className={cx(
        // `min-w-0` keeps a phone column from expanding to the card's
        // intrinsic min-content (week strip + seat chip + corner icons).
        // The step up at `sm` is the whole "make it bigger" pass in one place:
        // a phone card is padding-starved and stays at 16px, and a 720px
        // column on a laptop has room the card was not spending. Everything
        // else that grows below grows at the same breakpoint, so the card
        // never lands in a half-scaled state.
        "flex min-w-0 w-full flex-col gap-3 rounded-2xl border border-border-table",
        "bg-background-primary-default p-4 sm:gap-3.5 sm:p-5",
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
          <p className="truncate text-caption-1-medium tabular-nums text-text-secondary sm:text-body-2-medium">
            {card.code} · Sec {section.sectionCode} · {section.termLabel}
          </p>

          {/*
            The title links to the course page, not to Vergil. Vergil is where
            you register; this is where you decide, and the other sections, the
            full prerequisite text and the reviews are all there.
          */}
          {/*
            18px, and the largest thing on the card.

            It was 16px — the same size as the clock beside the week strip and
            the seat count, which are facts you check AFTER you have decided
            the class is worth checking. The title is the thing being chosen
            between; nothing else on the card is read first, so nothing else
            should be its equal.

            ── Two lines now, not one ────────────────────────────────────────

            This was `truncate whitespace-nowrap`, and the reason was
            alignment: side by side, a rail of mixed 1- and 2-line titles gave
            every card a different height above the week strip and the clocks
            and seat meters refused to line up across the row. In one column a
            row holds one card, so there is no longer a neighbour to line up
            with — and the rule had started costing what it was meant to save,
            since a bigger font truncates sooner. "Optimization Models and
            Methods" is a course you can recognise; "Optimization Models a…"
            is not.

            Two, not unbounded: `line-clamp-2` still caps the height so a
            60-character registrar title cannot push the seat meter off the
            first screen. The full name is on the course page this links to.
          */}
          <h3 className="min-w-0 text-title-3-semibold -tracking-[0.01em] text-text-primary sm:text-title-2-semibold">
            <Link
              href={sectionHref}
              className={cx(
                "block line-clamp-2 rounded-sm outline-none",
                "transition-colors duration-100",
                "hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
              )}
            >
              {title}
            </Link>
          </h3>

          {/*
            Only rendered when the headline above is the section's own name, and
            deliberately quiet: it is context for a title the reader has already
            read, not a second title. "Part of" rather than the bare course name
            because "Topics in Computer Science" sitting alone under "Computation
            and the Brain" reads as a contradiction rather than a containment.
          */}
          {ownTitle ? (
            <p className="truncate text-caption-2-regular text-text-tertiary sm:text-caption-1-regular">
              Part of {courseTitle}
            </p>
          ) : null}

          {/* The why moved out of the header — see `Why` below. */}
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
          {readOnly ? null : (
            <BookmarkControls
              sectionId={section.sectionId}
              sectionCode={section.sectionCode}
              courseLabel={card.code}
              size="xs"
            />
          )}
          <a
            href={section.vergilUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Vergil"
            aria-label={`Open ${card.code} section ${section.sectionCode}, call number ${section.callNumber}, in Vergil`}
            className={cx(
              "flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8",
              "text-foreground-icon-tertiary transition-colors duration-150",
              "hover:bg-background-primary-hover hover:text-text-primary",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiArrowRightUpLine aria-hidden className="size-4 sm:size-[1.125rem]" />
          </a>
        </div>
      </header>

      <FeedCardWhy reasons={card.reasons} />

      <TimeLine section={section} />
      <Teachers section={section} />
      <Ratings reputation={card.instructorReputation} />
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
      <p className="text-body-medium text-text-secondary sm:text-headline-medium">
        Meeting time not published
      </p>
    );
  }

  const lines = meetingLines(section.meetings);
  const primary = lines[0];
  if (!primary) {
    return (
      <p className="text-body-medium text-text-secondary sm:text-headline-medium">
        Meeting time not published
      </p>
    );
  }

  const extra = lines.length - 1;
  const estimated = section.timeKind === "estimated";

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <WeekStrip days={primary.days} />
      <p
        className={cx(
          "min-w-0 truncate text-headline-medium tabular-nums sm:text-title-3-medium",
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
      <p className="text-body-medium text-text-secondary sm:text-headline-medium">
        Instructor not yet announced
      </p>
    );
  }

  if (!isLinkableInstructor(primary)) {
    return (
      <p className="truncate text-body-medium text-text-secondary sm:text-headline-medium">
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
        <span className="min-w-0 truncate text-caption-1-medium text-text-secondary sm:text-body-2-medium">
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
    <p className="truncate text-caption-1-medium sm:text-body-2-medium">
      {clashes ? <span className="text-status-rose-text">Clashes with your plan</span> : null}
      {clashes && unverified ? " · " : null}
      {unverified ? <span className="text-text-secondary">Prerequisites unverified</span> : null}
    </p>
  );
}

/**
 * What students said about the person teaching it.
 *
 * ── Why this earns a row on a card this small ──────────────────────────────
 *
 * Two questions decide most registrations: does it count, and is it any good.
 * The first has had a line on this card since it existed — the reason clause
 * under the title. The second was behind a hover, which means it did not exist
 * for anyone on a phone and did not exist for anyone who never learned that
 * the instructor chip was hoverable. The hover card stays; this is the part of
 * it worth spending a line on without being asked.
 *
 * ── It sits under the instructor because that is who it is about ───────────
 *
 * Tempting to float it up next to the title, where it would be read first. It
 * would also be read as a rating OF THE COURSE, and we do not have those: 126
 * courses out of 10,582 carry a review. Sitting under the name, in a row that
 * begins with a star and ends with a review count, it can only be read as a
 * claim about the instructor — which is the only claim we can support.
 *
 * ── Absent is silent, and that is a deliberate choice ──────────────────────
 *
 * Roughly two thirds of cards land here with nothing to say, and this returns
 * `null` for all of them rather than printing "no reviews yet" (owner
 * decision). The layout absorbs it: cards stretch to the tallest in the run
 * and `EnrollmentChip` is pinned with `mt-auto`, so a missing row shortens the
 * middle without unaligning the seat meters across the rail.
 *
 * The row is never a verdict. Spec §12 — dimensions are reported separately
 * and nothing here averages teaching quality against workload, because "3.5
 * overall" is a number a student cannot act on and cannot argue with.
 */
function Ratings({ reputation }: { reputation: ReputationSummary | null }) {
  if (!reputation) return null;

  const { teachingQuality, workload, difficulty } = reputation.dimensions;

  /*
   * Workload before difficulty, and only ever one of them. They are strongly
   * correlated and phrased almost identically ("Heavy" / "Hard"), so printing
   * both spends half the row restating one fact. Workload wins because it is
   * the one a student is actually budgeting against a five-class term.
   */
  const effort =
    typeof workload === "number"
      ? `${WORKLOAD_WORD[bucket(workload)]} workload`
      : typeof difficulty === "number"
        ? DIFFICULTY_WORD[bucket(difficulty)]
        : null;

  const score = typeof teachingQuality === "number" ? teachingQuality : null;

  // Every dimension can be null independently — a review that said nothing
  // about workload must not become a 3. With neither, the sample size alone is
  // not worth a row.
  if (score == null && effort == null) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-caption-1-medium sm:gap-2 sm:text-body-2-medium">
      {score != null ? (
        <>
          <RiStarFill aria-hidden className="size-3.5 shrink-0 text-status-yellow-text sm:size-4" />
          {/*
            Primary, tabular, and the same weight as the title. This card's own
            rule: grey is for the eyebrow, and the facts you act on are the
            colour of the thing you came to read.
          */}
          <span className="shrink-0 tabular-nums text-text-primary">
            {score.toFixed(1)}
            <span className="text-text-secondary">/5</span>
          </span>
          <span className="shrink-0 text-text-secondary">teaching</span>
        </>
      ) : null}

      {score != null && effort ? <Dot /> : null}
      {effort ? <span className="min-w-0 truncate text-text-primary">{effort}</span> : null}

      {/*
        The sample size is not decoration. "4.8 teaching" off two reviews and
        off ninety are different statements, and this app refuses to collapse
        that into a confidence badge — it shows the number and lets the reader
        judge. Last to truncate, first to be believed.
      */}
      <Dot />
      <span className="shrink-0 text-text-secondary tabular-nums">
        {reputation.sampleSize === 1 ? "1 review" : `${reputation.sampleSize} reviews`}
      </span>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="shrink-0 text-text-tertiary">·</span>;
}

/**
 * 1–5 into an index, clamped.
 *
 * Deliberately not imported from `components/course/reputation.tsx`: that
 * module formats "3.4 / 5 · Moderate" for a panel with room to spell things
 * out, and this card wants the word alone. Sharing the formatter would mean
 * changing the panel's phrasing every time the card needed to be shorter.
 */
function bucket(value: number): number {
  return Math.min(4, Math.max(0, Math.round(value) - 1));
}

const WORKLOAD_WORD = ["Very light", "Light", "Moderate", "Heavy", "Very heavy"];
const DIFFICULTY_WORD = ["Very easy", "Easy", "Moderate", "Hard", "Very hard"];

/* ==========================================================================
 * Why this is here
 * ========================================================================== */

/**
 * The reasons, stated — plural, and no longer a footnote.
 *
 * ── What changed and why ───────────────────────────────────────────────────
 *
 * This used to be one clause, `line-clamp-1`, in caption grey under the title.
 * That was the right size for a rail: twelve cards glanced across, one line of
 * vertical budget each, and anything longer pushed the assistant's box off the
 * screen it shared.
 *
 * The rail is gone. Recommendations are the page now, and a page of
 * recommendations that does not say why is a page asking to be trusted rather
 * than read. A student who cannot see the reason cannot disagree with it, and
 * being able to disagree with it — "no, I already took that", "no, I don't
 * need the Science requirement" — is the whole difference between a recommender
 * and a slot machine.
 *
 * ── The kinds stay apart ───────────────────────────────────────────────────
 *
 * `RecommendationReason` keeps its variants distinct on purpose, and this is
 * the surface where that pays. "It clears the Global Core" and "you might like
 * it" are different claims with different consequences. Each gets its own row
 * and its own icon; nothing here blends them into a relevance score, because a
 * student who cannot tell whether the app is talking about their degree or
 * their taste stops trusting it about both.
 *
 * ── `unlocks` prints again, and both objections turned out to be bugs ──────
 *
 * It was suppressed on 2026-08-25 (owner decision) for two stated reasons: it
 * asked the reader to hold three unfamiliar course codes, and on a cold feed it
 * appeared on nearly every card, so it read as boilerplate.
 *
 * The first is answered by counting rather than naming — the codes were the
 * expensive part and the number is the part a student can act on. That change
 * immediately exposed why the second complaint was right: the count came off a
 * three-item sample, so EVERY card said "opens up 3 more courses" whether the
 * real figure was 2 or 40. Identical text on every card is exactly what
 * boilerplate looks like. `unlockedCount` now carries the real total.
 *
 * The deeper half of the same complaint was that the reason is a claim about
 * the student — these become reachable because YOU finished this — and on a
 * cold feed there is no student to make it true. `reasonsFor` no longer emits
 * it for a record with nothing in it, so it cannot be the only line on a card
 * that has nothing personal to say.
 */
export function FeedCardWhy({ reasons }: { reasons: readonly RecommendationReason[] }) {
  const rows = reasons.flatMap(reasonRows);
  if (rows.length === 0) return null;

  /*
   * Three, and they arrive ranked. A fourth row costs a card-height across the
   * whole page to add a reason nobody read the first three to reach.
   */
  const shown = rows.slice(0, 3);

  return (
    <ul className="flex min-w-0 flex-col gap-1 sm:gap-1.5">
      {shown.map((row) => (
        <li key={row.key} className="flex min-w-0 items-start gap-1.5">
          <row.icon
            aria-hidden
            className={cx("mt-px size-3.5 shrink-0 sm:size-4", row.tone)}
          />
          {/*
            The claim in primary, the framing in grey. Same rule the rest of
            this card follows: the reader skips grey, so the noun they are
            meant to act on must not be grey.
          */}
          <p className="min-w-0 text-caption-1-medium text-text-secondary sm:text-body-2-medium">
            {row.lead}
            {row.subject ? (
              <span className="text-text-primary">{row.subject}</span>
            ) : null}
            {row.tail}
          </p>
        </li>
      ))}
    </ul>
  );
}

interface WhyRow {
  key: string;
  icon: typeof RiCheckboxCircleLine;
  tone: string;
  /** Grey framing before the claim. */
  lead: string;
  /** The claim itself, in primary. */
  subject: string | null;
  /** Grey framing after it. */
  tail: string;
}

/**
 * One reason, as one or two rows.
 *
 * `interesting_and_counts` is the only kind that splits. It is genuinely two
 * claims — this clears something AND it looks like your taste — and the whole
 * point of keeping it a distinct variant rather than a flag on `required` is
 * that a student should be able to weigh them separately. Collapsing it back
 * into one line ("Satisfies X · your kind of thing") was a concession to the
 * rail's single line, and the rail is gone.
 */
function reasonRows(reason: RecommendationReason): WhyRow[] {
  switch (reason.kind) {
    case "required":
      return [
        {
          key: `required:${reason.groupId}`,
          icon: RiCheckboxCircleLine,
          tone: "text-status-lime-text",
          lead: "Satisfies ",
          subject: reason.groupLabel,
          tail: "",
        },
      ];

    case "interesting_and_counts":
      return [
        {
          key: `counts:${reason.groupId}`,
          icon: RiCheckboxCircleLine,
          tone: "text-status-lime-text",
          lead: "Satisfies ",
          subject: reason.groupLabel,
          tail: "",
        },
        {
          key: `taste:${reason.groupId}`,
          icon: RiSparkling2Line,
          tone: "text-accent-600",
          lead: "Like ",
          subject: andMore(reason.similarTo),
          tail: ", which you took",
        },
      ];

    case "because_you_took":
      return [
        {
          key: `took:${reason.similarTo.join(",")}`,
          icon: RiSparkling2Line,
          tone: "text-accent-600",
          lead: "Like ",
          subject: andMore(reason.similarTo),
          tail: ", which you took",
        },
      ];

    case "unlocks": {
      // The true total, not `courseIds.length` — that is a three-item sample,
      // and reading a count off it printed "3 more courses" on every card in
      // the feed regardless of whether the real number was 2 or 40.
      const count = reason.unlockedCount;
      if (count === 0) return [];
      return [
        {
          key: `unlocks:${reason.courseIds.join(",")}`,
          icon: RiRouteLine,
          tone: "text-foreground-icon-tertiary",
          lead: "Opens up ",
          subject: count === 1 ? "1 more course" : `${count} more courses`,
          tail: "",
        },
      ];
    }
  }
}

/** `"COMS W3134"`, or `"COMS W3134 +2"`. Printed form, never the stored id. */
function andMore(courseIds: readonly string[]): string {
  const [first, ...rest] = courseIds;
  if (!first) return "";
  return rest.length > 0 ? `${formatCourseId(first)} +${rest.length}` : formatCourseId(first);
}
