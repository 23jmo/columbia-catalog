import { RiExternalLinkLine } from "@remixicon/react";

import { displayCourseTitle } from "@/lib/onboarding/course-title";
import type { GroupResult, ProgramResult } from "@/lib/requirements/types";
import { cx } from "@/utils/cx";
import { AttestToggle } from "./attest-toggle";
import { CandidateChips } from "./candidate-chips";
import {
  STATUS_LABEL,
  VERIFICATION_TEXT_COLOR,
  progressLabel,
  verificationLabelFor,
  verificationNoteFor,
} from "./format";

/**
 * The whole degree, as one tree you can scan.
 *
 * ── Why a tree and not the stack of cards this replaces ─────────────────────
 *
 * `ProgramAuditCard` — deleted in the commit that added this — gave every
 * requirement a card of its own: heading, note, progress bar, status and
 * verification labels, matched courses as chips. It reads well for one
 * requirement and badly for forty. A Columbia
 * student with the Core, a major and a minor has three programs and upwards of
 * fifty requirements, and at roughly 120px of vertical space each that is a
 * page you scroll for a minute without ever seeing two related rows at once.
 *
 * The question this page answers is "where am I", and that question is
 * comparative — it needs the finished and unfinished parts of a program in the
 * same glance. So the unit here is a ROW, not a card: one line per requirement,
 * one line per course, indented under the program that asks for it. The same
 * fifty requirements fit on a screen or two, and the shape of the degree — what
 * is dense, what is empty — is visible before you read a single label.
 *
 * ── What is deliberately kept from the card version ─────────────────────────
 *
 * Two things, because they were right and are not about density:
 *
 * FINISHED REQUIREMENTS STAY. The obvious tree hides what is done and shows
 * what is left. An audit is read to check *our* work as much as to plan — "did
 * it notice that Frontiers counts?" — and a requirement that vanished when it
 * went green is one a student cannot audit back. Done rows stay, dimmed, with
 * the courses that satisfied them one disclosure away.
 *
 * VERIFICATION TIER IS STILL PRINTED — but only where it is news. "The Bulletin
 * names these courses and you have them", "this course carried the flag when we
 * last crawled it", and "you ticked a box" are three different claims and must
 * not render as three identical green ticks. What changed is *where* the
 * ordinary claim is stated. `exact` is two thirds of a transcribed program, so
 * printing "Named in the Bulletin" down twenty consecutive rows made the two
 * tiers that carry a real caveat impossible to pick out — the same mistake, in
 * grey text, that the lime pill made in colour. The ordinary tier is now stated
 * once in the legend and the two exceptions keep their place on the row.
 * `OutstandingCard` already worked this way; this brings the tree in line.
 *
 * ── Why unmet rows are not red ──────────────────────────────────────────────
 *
 * Stellic outlines unmet requirements in red. That is right for a senior
 * checking they can graduate and wrong for a first-year, whose audit is almost
 * entirely unmet by definition — a wall of red that says "you are failing" when
 * it means "you have not got there yet". Unmet here is a neutral outline, the
 * same tone `statusToneClass` already chose. Red is kept for nothing on this
 * page, because nothing on this page is an error.
 *
 * ── The legend belongs to the tree, not to each program ─────────────────────
 *
 * It used to be repeated in the footer of every program. Three programs is the
 * ordinary case for a Columbia student, so the same three paragraphs were
 * printed three times — around six hundred pixels of identical prose inside a
 * surface whose entire argument is density. The wording is a property of how
 * the AUDIT checks things, not of any one program, so it is stated once at the
 * bottom, behind a disclosure, and the Bulletin link that genuinely IS
 * per-program stays on the program.
 *
 * ── Disclosure is native ────────────────────────────────────────────────────
 *
 * `<details>`/`<summary>`, not React state. It is keyboard-operable and
 * screen-reader-announced for free, it survives with JavaScript still loading,
 * and this page is server-rendered — a client component here would be a
 * hydration boundary around the entire audit for the sake of a chevron.
 */

export interface AuditTreeProps {
  programs: ProgramResult[];
  /** `courseId` → the term the student says they took it, when they said. */
  termLabels: Record<string, string | null>;
  /**
   * `courseId` → catalog title, for the courses a requirement NAMES but the
   * student has not taken. Their titles cannot come off the audit: a `matched`
   * course carries a title because the student's own record was resolved, and a
   * candidate is by definition not on that record.
   */
  candidateTitles: Record<string, string>;
  /** Courses on the record that no requirement counted. Stellic's "unmatched". */
  uncounted: { courseId: string; code: string; title: string | null }[];
  className?: string;
}

export function AuditTree({
  programs,
  termLabels,
  candidateTitles,
  uncounted,
  className,
}: AuditTreeProps) {
  if (programs.length === 0) return null;

  const legend = legendFor(programs);

  return (
    <section
      className={cx("flex w-full flex-col gap-2", className)}
      aria-labelledby="audit-tree-heading"
    >
      <h2 id="audit-tree-heading" className="px-1.5 text-title-3-medium text-text-primary">
        Every requirement
      </h2>

      {programs.map((result) => (
        <ProgramBranch
          key={result.program.id}
          result={result}
          termLabels={termLabels}
          candidateTitles={candidateTitles}
        />
      ))}

      <UncountedBranch uncounted={uncounted} />

      {legend.length > 0 ? <LegendBranch entries={legend} /> : null}
    </section>
  );
}

/* ==========================================================================
 * One program
 * ========================================================================== */

function ProgramBranch({
  result,
  termLabels,
  candidateTitles,
}: {
  result: ProgramResult;
  termLabels: Record<string, string | null>;
  candidateTitles: Record<string, string>;
}) {
  const { program } = result;
  const credits = creditsApplied(result);

  return (
    <details
      open
      className="group/program overflow-hidden rounded-[20px] bg-background-secondary-default"
    >
      <summary
        className={cx(
          "flex min-h-14 cursor-pointer list-none items-center gap-2 px-2.5 py-2.5 outline-none",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <Disclosure className="group-open/program:rotate-90" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-caption-2-regular tracking-[0.04em] text-accent-600">
            {program.kind === "core" ? "Core curriculum" : program.kind}
          </p>
          {/*
            `OutstandingCard` links each of its rows to the program it belongs
            to, and this is the anchor those links aim at. Without the id they
            scroll nowhere — which is exactly what they did between the card
            version being deleted and this heading getting the id back.
          */}
          <h3
            id={`program-${program.id}-heading`}
            className="truncate scroll-mt-24 text-headline-semibold text-text-primary"
          >
            {program.name}
          </h3>
        </div>

        {/*
          Two numbers and a bar, each said in words rather than left as bare
          arithmetic. "24 pts  6/12" was three unlabelled figures in a row, and
          the first question it drew was "six of twelve what?".
        */}
        <div className="flex shrink-0 items-center gap-3">
          {/*
            Credits counted so far, which is the figure Stellic puts on the same
            row and the one a student checks against their own arithmetic. See
            `creditsApplied` for why it carries no denominator.
          */}
          {credits != null ? (
            <span className="hidden text-caption-1-regular text-text-tertiary sm:inline">
              <span className="tabular-nums text-text-secondary">{credits}</span> pts applied
            </span>
          ) : null}
          <span className="text-caption-1-regular text-text-tertiary">
            <span className="tabular-nums text-text-secondary">
              {result.satisfiedCount}/{result.groups.length}
            </span>{" "}
            done
          </span>
          <ProgressBar fraction={result.fraction} className="w-12 sm:w-20" />
        </div>
      </summary>

      <ul className="flex flex-col">
        {result.groups.map((group) => (
          <li key={group.group.id}>
            <RequirementBranch
              programId={program.id}
              group={group}
              termLabels={termLabels}
              candidateTitles={candidateTitles}
            />
          </li>
        ))}
      </ul>

      <div className="border-t border-border-table px-3.5 py-2">
        <a
          href={program.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 rounded-md py-0.5 text-caption-2-regular text-text-tertiary outline-none transition-colors duration-150 hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring motion-reduce:transition-none"
        >
          Check us against the {program.edition} Bulletin
          <RiExternalLinkLine className="size-3" aria-hidden />
        </a>
      </div>
    </details>
  );
}

/* ==========================================================================
 * One requirement
 * ========================================================================== */

function RequirementBranch({
  programId,
  group,
  termLabels,
  candidateTitles,
}: {
  programId: string;
  group: GroupResult;
  termLabels: Record<string, string | null>;
  candidateTitles: Record<string, string>;
}) {
  const done = group.status === "satisfied";
  const outstanding = Math.max(0, group.required - group.completed);
  /*
   * A row is worth opening if there is anything under it. An unmet requirement
   * with no named candidates — a flag-matched one — has nothing to show, so it
   * renders as a plain row rather than a disclosure that opens onto nothing.
   */
  const hasDetail =
    group.matched.length > 0 ||
    group.candidates.length > 0 ||
    group.verification === "attested" ||
    Boolean(group.group.note);

  const summary = (
    <>
      <StatusSquare status={group.status} verification={group.verification} />
      {/*
        Wraps rather than truncates. The Core has two requirements called
        "Science Requirement (Category A)" and "Science Requirement (Category
        B)", and at 390px `truncate` cut both to "Science Requirement (Catego…"
        — removing the only word that tells them apart and leaving two rows that
        read identically. The row is `min-h-11 items-center`, so a second line
        costs height on the handful of long labels and nothing anywhere else.
      */}
      <span
        className={cx(
          "min-w-0 flex-1 text-pretty text-body-regular",
          done ? "text-text-secondary" : "text-text-primary",
        )}
      >
        {group.group.label}
        {/*
          The status word used to be printed beside the count on every row —
          "Done … 1 of 1", "Not started … 1 left" — which is the same fact said
          twice in the space of four words. The square carries it visually and
          the count carries it in numbers; this keeps it for the readers who get
          neither.
        */}
        <span className="sr-only"> — {STATUS_LABEL[group.status]}</span>
      </span>

      {group.verification === "exact" ? null : (
        <span
          className={cx(
            "hidden shrink-0 text-caption-2-regular sm:inline",
            VERIFICATION_TEXT_COLOR[group.verification],
          )}
        >
          {verificationLabelFor(group.group.rule)}
        </span>
      )}
      {/*
        Stellic prints the number still owed in a box on the row, and it is the
        single most useful thing on a requirement you have not finished: "2" is
        an instruction, where "1 of 3" is arithmetic to do. Only unfinished rows
        carry it, because "0 left" is noise on a row already marked Done.
      */}
      <span
        className={cx(
          "shrink-0 text-caption-1-medium tabular-nums",
          // Tertiary on a row that is already at 70% opacity took the count
          // past "quiet" and into "unreadable" — it is still the row's answer.
          done ? "text-text-secondary" : "text-text-primary",
        )}
      >
        {done ? progressLabel(group.completed, group.required, group.unit) : `${outstanding} left`}
      </span>
    </>
  );

  if (!hasDetail) {
    return (
      <div className={cx(ROW_CLASS, done && "opacity-70")}>
        <span className="size-3.5 shrink-0" aria-hidden />
        {summary}
      </div>
    );
  }

  return (
    /*
      Open when there is still something to do, closed when there is not.
      Everything under a satisfied requirement is a receipt — the courses that
      matched it and the Bulletin's wording — and eighteen courses' worth of
      receipts expanded by default buried the four rows that still need a
      decision. The unmet ones open onto their candidate chips, which is the
      one place on this page you can act without navigating.
    */
    <details open={!done} className={cx("group/req", done && "opacity-70")}>
      <summary
        className={cx(
          ROW_CLASS,
          "cursor-pointer list-none outline-none transition-colors duration-150 motion-reduce:transition-none",
          "hover:bg-background-secondary-hover",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <Disclosure className="group-open/req:rotate-90" />
        {summary}
      </summary>

      {/*
        A rail, because an open requirement is the only place in the tree where
        two levels of content sit in one column. With four requirements expanded
        the courses, the chips and the note ran together into a single grey
        block and it stopped being obvious which requirement any given course
        belonged to. The line is what re-attaches them to the row above.
      */}
      <div className="pb-2 pl-8 pr-3.5 pt-1">
        <div className="flex flex-col gap-2 border-l border-border-table pl-3">
          {group.matched.length > 0 ? (
            <ul className="flex flex-col">
              {group.matched.map((match) => (
                <li key={match.courseId}>
                  <CourseRow
                    courseId={match.courseId}
                    code={match.code}
                    title={match.title}
                    points={match.points}
                    verification={group.verification}
                    planned={match.planned}
                    termLabel={termLabels[match.courseId] ?? null}
                  />
                </li>
              ))}
            </ul>
          ) : null}

          {!done && group.candidates.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-caption-2-regular text-text-tertiary">
                {group.group.rule.kind === "all_of" ? "Still needed" : "Any of these would count"}
              </p>
              <CandidateChips courseIds={group.candidates} titles={candidateTitles} />
            </div>
          ) : null}

          {group.verification === "attested" ? (
            <AttestToggle
              programId={programId}
              groupId={group.group.id}
              attestedAt={group.attestedAt ?? null}
            />
          ) : null}

          {/*
            The note last, and quiet. It explains what the requirement MEANS,
            which is reference material — a student who opened this row opened
            it to see which of their own courses counted, and leading with four
            lines of Bulletin prose put the answer underneath the explanation.
          */}
          {group.group.note ? (
            <p className="max-w-[68ch] text-caption-2-regular text-pretty text-text-tertiary">
              {group.group.note}
            </p>
          ) : null}
        </div>
      </div>
    </details>
  );
}

/**
 * One course under a requirement.
 *
 * ── Why the title leads and the code follows ────────────────────────────────
 *
 * The code came first and read as the identifier it is — a column of
 * `COMS W3134`s that a student has to decode one at a time. The question this
 * row answers is "did it count the class I think it did", and a class is known
 * by its name. So the name is the primary text and the code sits behind it,
 * still tabular, still a column you can run an eye down.
 *
 * Titles arrive from the registrar in two cases and the catalog stores them as
 * they came, so a list of them mixes "Art Humanities" with "INTRO-COMPUT
 * SCI/PROG IN JAVA". `displayCourseTitle` is the app's existing repair for
 * that; this lane simply never called it.
 *
 * When the catalog has no title the code becomes the primary text rather than
 * leaving the row headed by an empty span — that is the transfer-credit and
 * retired-offering case, and it is labelled rather than left blank, because a
 * row carrying a code and nothing else reads as a rendering failure.
 */
function CourseRow({
  courseId,
  code,
  title,
  points,
  verification,
  planned,
  termLabel,
}: {
  courseId: string;
  code: string;
  title: string | null;
  points: number | null;
  verification: GroupResult["verification"];
  planned: boolean;
  termLabel: string | null;
}) {
  const name = title ? displayCourseTitle(title) : null;

  return (
    <a
      href={`/course/${courseId}`}
      className={cx(
        "flex min-h-9 items-center gap-2 rounded-lg px-1.5 py-1 outline-none transition-colors duration-150 motion-reduce:transition-none",
        "hover:bg-background-primary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring",
      )}
    >
      <StatusSquare
        status={planned ? "in_progress" : "satisfied"}
        verification={verification}
        small
      />
      {name ? (
        <>
          <span className="min-w-0 flex-1 truncate text-caption-1-regular text-text-primary">
            {name}
          </span>
          {/*
            Below `sm` the code goes away rather than truncating the title into
            "Literature Hum…". The title is what identifies the course to the
            person reading it; the code is the lookup key they need when they go
            to SSOL, and there is no room for both at 390px. The row is a link
            to the course page, which prints the code at the top.
          */}
          <span className="hidden shrink-0 text-caption-2-regular tabular-nums text-text-tertiary sm:inline">
            {code}
          </span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-caption-1-medium tabular-nums text-text-primary">
            {code}
          </span>
          <span className="shrink-0 text-caption-2-regular text-text-tertiary">
            not in our catalog
          </span>
        </>
      )}
      {points != null ? (
        <span className="hidden shrink-0 text-caption-2-regular tabular-nums text-text-tertiary sm:inline">
          {points} pts
        </span>
      ) : null}
      <span className="w-[4.5rem] shrink-0 text-right text-caption-2-regular text-text-tertiary">
        {planned ? "Planned" : (termLabel ?? "Taken")}
      </span>
    </a>
  );
}

/* ==========================================================================
 * Courses that counted toward nothing
 * ========================================================================== */

/**
 * Not a program, so no longer shaped like one.
 *
 * It used to render in the same filled `rounded-[20px]` surface as the Core and
 * the major, which put "one elective we did not need" at the visual weight of a
 * whole degree's requirements. It is a footnote to the tree — an outline strip,
 * closed, sitting under the things it is a footnote to.
 */
function UncountedBranch({
  uncounted,
}: {
  uncounted: { courseId: string; code: string; title: string | null }[];
}) {
  if (uncounted.length === 0) {
    return (
      <p className="px-3.5 py-1 text-caption-2-regular text-text-tertiary">
        Every course on your record counts toward something.
      </p>
    );
  }

  return (
    <details className="group/unmatched overflow-hidden rounded-2lg border border-border-table">
      <summary
        className={cx(
          "flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 py-2 outline-none",
          "transition-colors duration-150 hover:bg-background-secondary-default motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <Disclosure className="group-open/unmatched:rotate-90" />
        <span className="min-w-0 flex-1 text-caption-1-regular text-text-secondary">
          Counting toward nothing
        </span>
        <span className="shrink-0 text-caption-1-medium tabular-nums text-text-secondary">
          {uncounted.length}
        </span>
      </summary>

      <div className="flex flex-col gap-2 px-3.5 pb-2.5">
        {/*
          The wording matters more than the list. An elective taken because it
          looked interesting counts toward nothing and that is a fine thing to
          have done — this must not read as a list of mistakes. The reason to
          print it at all is the other explanation: that we mis-audited one.
        */}
        <p className="max-w-[68ch] text-caption-2-regular text-pretty text-text-tertiary">
          These are on your record but no requirement above needed them. Often that is
          simply an elective. If one of these should have counted, the Bulletin link on
          the program is the place to check us.
        </p>
        <ul className="flex flex-col">
          {uncounted.map((course) => (
            <li key={course.courseId}>
              <a
                href={`/course/${course.courseId}`}
                className={cx(
                  "flex min-h-9 items-center gap-2 rounded-lg px-1.5 py-1 outline-none transition-colors duration-150 motion-reduce:transition-none",
                  "hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-caption-1-regular text-text-primary">
                  {course.title ? displayCourseTitle(course.title) : course.code}
                </span>
                {course.title ? (
                  <span className="shrink-0 text-caption-2-regular tabular-nums text-text-tertiary">
                    {course.code}
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/* ==========================================================================
 * How the checks are made — once, for the whole tree
 * ========================================================================== */

function LegendBranch({
  entries,
}: {
  entries: { label: string; note: string; verification: GroupResult["verification"] }[];
}) {
  return (
    <details className="group/legend overflow-hidden rounded-2lg border border-border-table">
      <summary
        className={cx(
          "flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 py-2 outline-none",
          "transition-colors duration-150 hover:bg-background-secondary-default motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <Disclosure className="group-open/legend:rotate-90" />
        <span className="min-w-0 flex-1 text-caption-1-regular text-text-secondary">
          How each requirement was checked
        </span>
      </summary>

      <div className="flex flex-col gap-2.5 px-3.5 pb-3">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-col gap-0.5">
            <p className={cx("text-caption-2-regular", VERIFICATION_TEXT_COLOR[entry.verification])}>
              {entry.label}
            </p>
            <p className="max-w-[68ch] text-caption-2-regular text-pretty text-text-tertiary">
              {entry.note}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

/* ==========================================================================
 * Row furniture
 * ========================================================================== */

const ROW_CLASS =
  "flex min-h-11 items-center gap-2 border-t border-border-table px-3.5 py-2 first:border-t-0";

/**
 * The status square.
 *
 * A filled square for something that counted, an outline for something that has
 * not happened yet. Shape carries the distinction as well as colour does, which
 * is the point — roughly one in twelve men cannot separate the lime from the
 * rose, and this is the one glyph on the page that has to survive that.
 */
function StatusSquare({
  status,
  verification,
  small = false,
}: {
  status: GroupResult["status"];
  verification: GroupResult["verification"];
  small?: boolean;
}) {
  const done = status === "satisfied";
  const attested = done && verification === "attested";

  return (
    <span
      aria-hidden
      className={cx(
        "shrink-0 rounded-[4px] border",
        small ? "size-2.5" : "size-3.5",
        done && !attested && "border-status-lime-text bg-status-lime-text",
        attested && "border-status-yellow-text bg-status-yellow-text",
        status === "in_progress" && "border-status-cyan-text bg-status-cyan-background",
        status === "unmet" && "border-border-checkbox-default bg-transparent",
      )}
    />
  );
}

/**
 * The chevron.
 *
 * The rotation class is the caller's, not this component's: it has to name the
 * specific `<details>` group it belongs to (`group-open/req`, `group-open/program`)
 * or a nested requirement row would turn its chevron when the PROGRAM opened.
 */
function Disclosure({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cx(
        "size-3.5 shrink-0 text-text-tertiary transition-transform duration-150 motion-reduce:transition-none",
        className,
      )}
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProgressBar({ fraction, className }: { fraction: number; className?: string }) {
  return (
    <span
      className={cx(
        "block h-1.5 overflow-hidden rounded-full bg-background-tertiary-default",
        className,
      )}
      role="img"
      aria-label={`${Math.round(fraction * 100)}% complete`}
    >
      <span
        className="block h-full w-full origin-left rounded-full bg-accent-500 transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${fraction})` }}
      />
    </span>
  );
}

/* ==========================================================================
 * Derived numbers
 * ========================================================================== */

/**
 * Credits this program has actually counted, or null when it counted none.
 *
 * ── Why this is earned-only, with no denominator ────────────────────────────
 *
 * Two obvious denominators were tried and both lie.
 *
 * Summing `required` over the `points`-unit groups gives the Computer Science
 * major "9", because a single `points_matching` electives rule is the only
 * credit-denominated thing in it — so a student one requirement short of the
 * major would read "0 of 9 pts" next to "1/8 requirements" and reasonably
 * conclude one of the two numbers was broken.
 *
 * `program.degreePoints` is worse. Only the two core programs carry it, and the
 * 124 on `cc-core` (128 on `seas-core`) is the total for the WHOLE DEGREE, not
 * for the Core — printing "31 of 124 pts" under the heading "The Core
 * Curriculum" states something false about what the Core requires. Reconciling
 * any single track against that number is a documented way to get this wrong.
 *
 * So there is no denominator here, because the program does not honestly have
 * one. "31 pts" is what this program has counted, which is true, and the
 * requirement rows underneath carry the "how much is left" question that a
 * denominator was standing in for.
 *
 * Deduplicated by course id: one course legitimately satisfies two groups (the
 * audit reports cross-counting rather than preventing it), and adding its
 * credits once per group would inflate the total a student is checking.
 */
function creditsApplied(result: ProgramResult): number | null {
  const seen = new Map<string, number>();
  for (const group of result.groups) {
    for (const match of group.matched) {
      if (match.points == null || seen.has(match.courseId)) continue;
      seen.set(match.courseId, match.points);
    }
  }
  if (seen.size === 0) return null;
  let total = 0;
  for (const points of seen.values()) total += points;
  return total > 0 ? round(total) : null;
}

/** Credits are stored as `numeric(4,2)`; sums of halves must not print as 12.000000000002. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * One entry per distinct verification wording present anywhere in the tree.
 *
 * Keyed by label rather than by tier: `flagged` covers both "matched on a
 * curriculum flag" and "matched by subject and level", which are different
 * claims with different caveats, and collapsing them would print one of the two
 * explanations over a rule it is not true of.
 *
 * Attested groups are absent by design — they carry `AttestToggle`, which says
 * what it means to tick the box at the moment of ticking it.
 *
 * Computed across every program rather than per program, because the tree
 * prints it once now. Three programs that share a tier share one paragraph
 * about it.
 */
function legendFor(programs: ProgramResult[]) {
  const seen = new Set<string>();
  const entries: { label: string; note: string; verification: GroupResult["verification"] }[] = [];

  for (const result of programs) {
    for (const group of result.groups) {
      if (group.verification === "attested") continue;
      const label = verificationLabelFor(group.group.rule);
      if (seen.has(label)) continue;
      seen.add(label);
      entries.push({
        label,
        note: verificationNoteFor(group.group.rule),
        verification: group.verification,
      });
    }
  }

  return entries;
}
