import { RiExternalLinkLine } from "@remixicon/react";

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
 * VERIFICATION TIER IS STILL PRINTED. "The Bulletin names these courses and you
 * have them", "this course carried the flag when we last crawled it", and "you
 * ticked a box" are three different claims and must not render as three
 * identical green ticks. The row keeps the label; the wording that explains it
 * appears once per program, in the legend, exactly as before.
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
  /** Courses on the record that no requirement counted. Stellic's "unmatched". */
  uncounted: { courseId: string; code: string; title: string | null }[];
  className?: string;
}

export function AuditTree({ programs, termLabels, uncounted, className }: AuditTreeProps) {
  if (programs.length === 0) return null;

  return (
    <section
      className={cx("flex w-full flex-col gap-2", className)}
      aria-labelledby="audit-tree-heading"
    >
      <h2 id="audit-tree-heading" className="px-1.5 text-title-3-medium text-text-primary">
        Every requirement
      </h2>

      {programs.map((result) => (
        <ProgramBranch key={result.program.id} result={result} termLabels={termLabels} />
      ))}

      <UncountedBranch uncounted={uncounted} />
    </section>
  );
}

/* ==========================================================================
 * One program
 * ========================================================================== */

function ProgramBranch({
  result,
  termLabels,
}: {
  result: ProgramResult;
  termLabels: Record<string, string | null>;
}) {
  const { program } = result;
  const legend = legendFor(result);
  const credits = creditsApplied(result);

  return (
    <details
      open
      className="group/program overflow-hidden rounded-[20px] bg-background-secondary-default"
    >
      <summary
        className={cx(
          "flex cursor-pointer list-none items-center gap-2 px-2.5 py-2.5 outline-none",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <Disclosure className="group-open/program:rotate-90" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-caption-2-regular tracking-[0.04em] text-accent-600">
            {program.kind === "core" ? "Core curriculum" : program.kind}
          </p>
          <h3 className="truncate text-headline-semibold text-text-primary">{program.name}</h3>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {/*
            Credits counted so far, which is the figure Stellic puts on the same
            row and the one a student checks against their own arithmetic. See
            `creditsApplied` for why it carries no denominator.
          */}
          {credits != null ? (
            <span className="hidden text-caption-1-medium tabular-nums text-text-secondary sm:inline">
              {credits} pts
            </span>
          ) : null}
          <span className="text-caption-1-medium tabular-nums text-text-secondary">
            {result.satisfiedCount}/{result.groups.length}
          </span>
          <ProgressBar fraction={result.fraction} className="w-16 sm:w-24" />
        </div>
      </summary>

      <ul className="flex flex-col">
        {result.groups.map((group) => (
          <li key={group.group.id}>
            <RequirementBranch
              programId={program.id}
              group={group}
              termLabels={termLabels}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 border-t border-border-table px-3.5 py-2.5">
        {legend.map((entry) => (
          <div key={entry.label} className="flex flex-col gap-0.5">
            <p className={cx("text-caption-2-regular", VERIFICATION_TEXT_COLOR[entry.verification])}>
              {entry.label}
            </p>
            <p className="max-w-[68ch] text-caption-2-regular text-pretty text-text-tertiary">
              {entry.note}
            </p>
          </div>
        ))}
        <a
          href={program.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 rounded-md py-0.5 text-caption-1-medium text-text-secondary outline-none transition-colors duration-150 hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Check us against the {program.edition} Bulletin
          <RiExternalLinkLine className="size-3.5" aria-hidden />
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
}: {
  programId: string;
  group: GroupResult;
  termLabels: Record<string, string | null>;
}) {
  const done = group.status === "satisfied";
  const outstanding = Math.max(0, group.required - group.completed);
  /*
   * A row is worth opening if there is anything under it. An unmet requirement
   * with no named candidates — a flag-matched one — has nothing to show, so it
   * renders as a plain row rather than a disclosure that opens onto nothing.
   */
  const hasDetail =
    group.matched.length > 0 || group.candidates.length > 0 || group.verification === "attested";

  const summary = (
    <>
      <StatusSquare status={group.status} verification={group.verification} />
      <span
        className={cx(
          "min-w-0 flex-1 truncate text-subheadline-regular",
          done ? "text-text-secondary" : "text-text-primary",
        )}
      >
        {group.group.label}
      </span>

      <span className="shrink-0 text-caption-2-regular text-text-tertiary">
        {STATUS_LABEL[group.status]}
      </span>
      <span
        className={cx(
          "hidden shrink-0 text-caption-2-regular sm:inline",
          VERIFICATION_TEXT_COLOR[group.verification],
        )}
      >
        {verificationLabelFor(group.group.rule)}
      </span>
      {/*
        Stellic prints the number still owed in a box on the row, and it is the
        single most useful thing on a requirement you have not finished: "2" is
        an instruction, where "1 of 3" is arithmetic to do. Only unfinished rows
        carry it, because "0 left" is noise on a row already marked Done.
      */}
      <span className="shrink-0 text-caption-1-medium tabular-nums text-text-secondary">
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
    <details className={cx("group/req", done && "opacity-70")}>
      <summary
        className={cx(
          ROW_CLASS,
          "cursor-pointer list-none outline-none",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <Disclosure className="group-open/req:rotate-90" />
        {summary}
      </summary>

      <div className="flex flex-col gap-2 py-1.5 pl-9 pr-3.5">
        {group.group.note ? (
          <p className="max-w-[68ch] text-caption-2-regular text-pretty text-text-tertiary">
            {group.group.note}
          </p>
        ) : null}

        {group.matched.length > 0 ? (
          <ul className="flex flex-col">
            {group.matched.map((match) => (
              <li key={match.courseId}>
                <a
                  href={`/course/${match.courseId}`}
                  className={cx(
                    "flex items-center gap-2 rounded-md py-1 pr-1 outline-none transition-colors duration-150",
                    "hover:bg-background-primary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  )}
                >
                  <StatusSquare
                    status={match.planned ? "in_progress" : "satisfied"}
                    verification={group.verification}
                    small
                  />
                  <span className="shrink-0 text-caption-1-medium tabular-nums text-text-primary">
                    {match.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-caption-2-regular text-text-secondary">
                    {match.title ?? ""}
                  </span>
                  {match.points != null ? (
                    <span className="shrink-0 text-caption-2-regular tabular-nums text-text-tertiary">
                      {match.points} pts
                    </span>
                  ) : null}
                  <span className="hidden shrink-0 text-caption-2-regular text-text-tertiary sm:inline">
                    {match.planned
                      ? "Planned"
                      : (termLabels[match.courseId] ?? "Taken")}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {!done && group.candidates.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-caption-2-regular text-text-tertiary">
              {group.group.rule.kind === "all_of" ? "Still needed" : "Any of these would count"}
            </p>
            <CandidateChips courseIds={group.candidates} />
          </div>
        ) : null}

        {group.verification === "attested" ? (
          <AttestToggle
            programId={programId}
            groupId={group.group.id}
            attestedAt={group.attestedAt ?? null}
          />
        ) : null}
      </div>
    </details>
  );
}

/* ==========================================================================
 * Courses that counted toward nothing
 * ========================================================================== */

function UncountedBranch({
  uncounted,
}: {
  uncounted: { courseId: string; code: string; title: string | null }[];
}) {
  if (uncounted.length === 0) {
    return (
      <p className="px-3.5 py-2 text-caption-2-regular text-text-tertiary">
        Every course on your record counts toward something.
      </p>
    );
  }

  return (
    <details className="group/unmatched overflow-hidden rounded-[20px] bg-background-secondary-default">
      <summary
        className={cx(
          "flex cursor-pointer list-none items-center gap-2 px-2.5 py-2.5 outline-none",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <Disclosure className="group-open/unmatched:rotate-90" />
        <span className="min-w-0 flex-1 text-subheadline-regular text-text-primary">
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
                  "flex items-center gap-2 rounded-md py-1 pr-1 outline-none transition-colors duration-150",
                  "hover:bg-background-primary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                )}
              >
                <span className="shrink-0 text-caption-1-medium tabular-nums text-text-primary">
                  {course.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-caption-2-regular text-text-secondary">
                  {course.title ?? ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/* ==========================================================================
 * Row furniture
 * ========================================================================== */

const ROW_CLASS =
  "flex items-center gap-2 border-t border-border-table px-3.5 py-2 first:border-t-0";

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
 * One entry per distinct verification wording present in the program.
 *
 * Keyed by label rather than by tier: `flagged` covers both "matched on a
 * curriculum flag" and "matched by subject and level", which are different
 * claims with different caveats, and collapsing them would print one of the two
 * explanations over a rule it is not true of.
 *
 * Attested groups are absent by design — they carry `AttestToggle`, which says
 * what it means to tick the box at the moment of ticking it.
 */
function legendFor(result: ProgramResult) {
  const seen = new Set<string>();
  const entries: { label: string; note: string; verification: GroupResult["verification"] }[] = [];

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

  return entries;
}
