"use client";

import { useMemo } from "react";

import { SCHOOL_LABEL, type School } from "@/lib/requirements/types";

import { ChipWrap, OptionChip } from "./chip";

/**
 * The three degree questions, each its own screen.
 *
 * ── Why one step became three screens ───────────────────────────────────────
 *
 * School, class year and programs used to share a screen: three legends, three
 * hints, and a form. It answered fastest for the student who already knew all
 * three, and it stalled everyone else, because a screen with three questions
 * has to explain which one to answer first. Split, each screen has exactly one
 * decision on it and the headline is the whole instruction.
 *
 * They are still ONE step in `lib/onboarding/state.ts`. The step machine is
 * what the guest state persists and what the migration and the tests are
 * written against; splitting it would have been a data change dressed up as a
 * layout change. The sub-question is local component state instead, and the
 * flow resumes it from what has already been answered — so a refresh mid-way
 * lands on the first UNANSWERED question rather than back at the top.
 *
 * ── Why school is asked separately from program ─────────────────────────────
 *
 * The Core is resolved from the school, never picked (`programsFor` in
 * `lib/profile/audit.ts`). A Columbia College student cannot elect out of it,
 * so listing it among the options would imply they could, and a student who
 * left it unpicked would be onboarded against half their degree.
 */

export interface ProgramOption {
  id: string;
  name: string;
  kind: string;
  school: string;
  origin: "authored" | "parsed";
}

const SCHOOL_ORDER: School[] = ["CC", "SEAS", "GS", "BC"];

/* ==========================================================================
 * What we actually cover
 * ========================================================================== */

/**
 * The schools the program registry has anything at all for.
 *
 * DERIVED from `listPrograms()`, never listed. Today that set is {CC, SEAS}:
 * `lib/requirements/programs/index.ts` holds fifteen authored programs, all of
 * them Columbia College or Engineering, and `PARSED_PROGRAMS` is empty. General
 * Studies and Barnard have zero — not just zero majors but zero Core, because
 * `coreForSchool` resolves out of the same registry.
 *
 * That is why this is computed rather than written down. The moment somebody
 * transcribes a GS program, GS stops being uncovered here with no edit to this
 * file; a hard-coded "schools we support" list would keep lying until someone
 * remembered to come back.
 */
export function schoolsWithPrograms(options: readonly ProgramOption[]): Set<string> {
  return new Set(options.map((option) => option.school));
}

/**
 * The programs a student can actually pick, given their school.
 *
 * Cores are excluded because they are resolved from the school, not elected.
 * Programs already picked are always kept, whatever school they belong to, so
 * that changing school does not silently drop a major that is still on the
 * record — it stays visible, labelled with its own school, to be removed
 * deliberately.
 *
 * `ProgramsQuestion` renders exactly this list and the flow decides whether to
 * show that screen at all from exactly this list, so the screen that gets
 * skipped is by construction the screen that would have been empty.
 */
export function electableProgramsFor(
  school: School | null,
  options: readonly ProgramOption[],
  programIds: readonly string[],
): ProgramOption[] {
  const picked = new Set(programIds);
  return options
    .filter((option) => option.kind !== "core")
    .filter((option) =>
      school ? option.school === school || picked.has(option.id) : picked.has(option.id),
    );
}

/* ==========================================================================
 * 1 · School
 * ========================================================================== */

/**
 * All four schools are offered, including the two we cannot audit.
 *
 * Hiding General Studies and Barnard would be the tidier screen and the worse
 * product. A GS student who cannot find their school does not conclude "no
 * requirements data yet"; they conclude the site is not for them and leave —
 * and they would be wrong, because everything downstream of this step works for
 * them. The coursework guess degrades to what the taste engine can infer, the
 * love screen is unaffected, interests are unaffected, and the feed is built
 * from similarity, not from a degree audit. The only thing they lose is the
 * requirement checking.
 *
 * So the chip stays and the limitation is stated the instant it becomes true —
 * on selection, on this screen, before they have invested anything. Telling
 * them one screen later, on an empty program list, would be asking them to pay
 * first. The spec calls Barnard out of scope and separately notes the sharp
 * edge that Barnard students can already sign in and get nothing; the screen's
 * job is to not make that worse by being coy about it.
 */
export function SchoolQuestion({
  school,
  onChange,
  coveredSchools,
}: {
  school: School | null;
  onChange: (school: School | null) => void;
  /** Schools the registry has programs for. Derived, see `schoolsWithPrograms`. */
  coveredSchools: ReadonlySet<string>;
}) {
  const isUncovered = school !== null && !coveredSchools.has(school);

  return (
    <div className="flex flex-col gap-5">
      <ChipWrap>
        {SCHOOL_ORDER.map((option) => (
          <OptionChip
            key={option}
            isSelected={school === option}
            // Re-pressing clears. Nothing in this flow is a one-way door, and a
            // single-select group with no way back to "unanswered" is one.
            onPress={() => onChange(school === option ? null : option)}
          >
            {SCHOOL_LABEL[option]}
          </OptionChip>
        ))}
      </ChipWrap>

      {isUncovered ? (
        <p
          // Announced rather than silently appearing: the student pressed a
          // chip and the consequence is text somewhere else on the screen.
          role="status"
          className="mx-auto max-w-[34rem] text-center text-caption-1-regular text-text-tertiary"
        >
          {`We haven't mapped ${SCHOOL_LABEL[school]} requirements yet, so we can't check your degree progress. Everything else works — keep going and we'll still learn what you like and recommend from it.`}
        </p>
      ) : null}
    </div>
  );
}

/* ==========================================================================
 * 2 · Class year
 * ========================================================================== */

/**
 * Four years forward from now, which covers every undergraduate on campus.
 *
 * Offered as chips rather than a text field because the answer is one of five
 * values and a keyboard is a worse way to pick one of five. `classYear` stays
 * free text in the guest state — the field is used for a seniority *guess*
 * (`yearsCompleted` in `guess.ts`) and nothing branches on it being a member of
 * this list, so a value typed on the profile screen later is still valid.
 */
function graduationYears(now: Date): string[] {
  const first = now.getFullYear();
  return [0, 1, 2, 3, 4].map((offset) => String(first + offset));
}

export function ClassYearQuestion({
  classYear,
  onChange,
}: {
  classYear: string | null;
  onChange: (classYear: string | null) => void;
}) {
  const years = useMemo(() => graduationYears(new Date()), []);

  return (
    <ChipWrap>
      {years.map((year) => (
        <OptionChip
          key={year}
          isSelected={classYear === year}
          onPress={() => onChange(classYear === year ? null : year)}
        >
          {year}
        </OptionChip>
      ))}
      {/* Skipping is a real answer here — the guess degrades to "first year",
          which is the conservative end and never over-claims coursework. */}
      <OptionChip isSelected={classYear === null} onPress={() => onChange(null)}>
        Not sure
      </OptionChip>
    </ChipWrap>
  );
}

/* ==========================================================================
 * 3 · Programs
 * ========================================================================== */

const KIND_LABEL: Record<string, string> = {
  major: "Major",
  minor: "Minor",
  concentration: "Concentration",
  core: "Core",
};

export function ProgramsQuestion({
  school,
  programIds,
  programOptions,
  onToggleProgram,
}: {
  school: School | null;
  programIds: readonly string[];
  programOptions: readonly ProgramOption[];
  /** One id, not the new list — two taps in a frame must not lose one. */
  onToggleProgram: (programId: string) => void;
}) {
  const visible = useMemo(
    () => electableProgramsFor(school, programOptions, programIds),
    [programOptions, programIds, school],
  );

  /*
   * No empty state, because this screen is never reached empty.
   *
   * It used to carry one, and it said "Carry on — the Core is enough to work
   * from". That was false for the only two schools that could ever see it: GS
   * and BC have no Core in the registry either, so the sentence promised a
   * fallback that does not exist. The flow now skips this question outright
   * when `electableProgramsFor` comes back empty, and the honest version of the
   * message is delivered a screen earlier, at the moment the school is picked.
   */
  const picked = new Set(programIds);

  return (
    <ChipWrap>
      {visible.map((option) => {
        const isForeign = option.school !== school;
        return (
          <OptionChip
            key={option.id}
            isSelected={picked.has(option.id)}
            onPress={() => onToggleProgram(option.id)}
            sublabel={
              (KIND_LABEL[option.kind] ?? option.kind) +
              (isForeign ? ` · ${SCHOOL_LABEL[option.school as School] ?? option.school}` : "")
            }
          >
            {option.name}
          </OptionChip>
        );
      })}
    </ChipWrap>
  );
}
