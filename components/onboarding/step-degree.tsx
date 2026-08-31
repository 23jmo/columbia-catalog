"use client";

import { useEffect, useMemo, useRef } from "react";

import { Input } from "@/components/base/input/input";
import { SCHOOL_LABEL, type School } from "@/lib/requirements/types";

import { ChipWrap, OptionChip } from "./chip";

/**
 * The three degree questions, each its own screen.
 *
 * ── Why one step became three screens ───────────────────────────────────────
 *
 * School, class year, major and minors used to share a screen: four legends, four
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
 * DERIVED from `listPrograms()`, never listed. Today that set is {CC, SEAS,
 * BC}. General Studies is the one that still has zero — not just zero majors
 * but zero Core, because `coreForSchool` resolves out of the same registry.
 *
 * That is why this is computed rather than written down, and Barnard is the
 * proof it was worth it. On 2026-08-30 somebody transcribed Foundations and
 * eleven Barnard majors into `lib/requirements/programs/index.ts`; Barnard
 * stopped being uncovered here, and the picker started offering it, with no
 * edit to this function. A hard-coded "schools we support" list would have
 * kept lying until someone remembered to come back — and note that the
 * previous version of this very comment DID name a count, and was wrong about
 * it by ten programs before anyone noticed. Do not write the number down.
 */
export function schoolsWithPrograms(options: readonly ProgramOption[]): Set<string> {
  return new Set(options.map((option) => option.school));
}

/**
 * The programs a student can actually pick, given their school.
 *
 * Cores are excluded because they are resolved from the school, not elected.
 * Programs already picked are kept only when they belong to the current
 * school. Changing school used to leave the old major selected and labelled
 * with its original school — so a CC CS student who backed up and switched
 * to SEAS arrived at "what's your major?" still holding Computer Science.
 * Dropping the foreign id is the honest move: that answer was about a
 * school they just said they are not in.
 *
 * `MajorsQuestion` and `MinorsQuestion` render from these lists; the flow
 * skips a screen when its list is empty.
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
      school ? option.school === school : picked.has(option.id),
    );
}

const MAJOR_KINDS = ["major"] as const;
const MINOR_KINDS = ["minor"] as const;
/** Majors plus leftover concentrations from an older picker. */
const DECLARED_STUDY_KINDS = ["major", "concentration"] as const;

/** Majors and concentrations a student can elect for their school. */
export function electableMajorsFor(
  school: School | null,
  options: readonly ProgramOption[],
  programIds: readonly string[],
): ProgramOption[] {
  const kinds = new Set<string>(MAJOR_KINDS);
  return electableProgramsFor(school, options, programIds).filter((option) =>
    kinds.has(option.kind),
  );
}

/** Minors a student can elect for their school. */
export function electableMinorsFor(
  school: School | null,
  options: readonly ProgramOption[],
  programIds: readonly string[],
): ProgramOption[] {
  const kinds = new Set<string>(MINOR_KINDS);
  return electableProgramsFor(school, options, programIds).filter((option) =>
    kinds.has(option.kind),
  );
}

/** True when at least one picked program is a major for this school. */
export function hasSelectedMajor(
  programIds: readonly string[],
  options: readonly ProgramOption[],
  school?: School | null,
): boolean {
  const byId = new Map(options.map((option) => [option.id, option]));
  const majorKinds = new Set<string>(DECLARED_STUDY_KINDS);
  return programIds.some((id) => {
    const option = byId.get(id);
    if (option === undefined || !majorKinds.has(option.kind)) return false;
    if (school && option.school !== school) return false;
    return true;
  });
}

/** True when at least one picked program is a minor. */
export function hasSelectedMinor(
  programIds: readonly string[],
  options: readonly ProgramOption[],
): boolean {
  const byId = new Map(options.map((option) => [option.id, option]));
  return programIds.some((id) => {
    const option = byId.get(id);
    return option?.kind === "minor";
  });
}

/* ==========================================================================
 * 1 · School
 * ========================================================================== */

/**
 * All four schools are offered, including the one we cannot audit.
 *
 * Hiding General Studies would be the tidier screen and the worse product. A GS
 * student who cannot find their school does not conclude "no requirements data
 * yet"; they conclude the site is not for them and leave — and they would be
 * wrong, because everything downstream of this step works for them. The
 * coursework guess degrades to what the taste engine can infer, the love screen
 * is unaffected, interests are unaffected, and the feed is built from
 * similarity, not from a degree audit. The only thing they lose is the
 * requirement checking.
 *
 * So the chip stays and the limitation is stated the instant it becomes true —
 * on selection, on this screen, before they have invested anything. Telling
 * them one screen later, on an empty program list, would be asking them to pay
 * first.
 *
 * Barnard used to be the second such school, and the sharpest edge in the
 * product: a Barnard student could sign in and get nothing. That is fixed as of
 * 2026-08-30 — Foundations and eleven majors are authored, so BC now takes the
 * covered path here. The warning copy is keyed off `schoolsWithPrograms`, not
 * off a school name, which is why fixing the registry fixed the screen.
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
          {`This program is unavailable right now. We're working on it.`}
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
 * 3 · Major
 * 4 · Minors
 * ========================================================================== */

/** Majors — at least one required when any are offered. "Other" is a typed major. */
export function MajorsQuestion({
  school,
  programIds,
  programOptions,
  customMajor,
  onToggleProgram,
  onCustomMajorChange,
}: {
  school: School | null;
  programIds: readonly string[];
  programOptions: readonly ProgramOption[];
  customMajor: string | null;
  onToggleProgram: (programId: string) => void;
  onCustomMajorChange: (value: string | null) => void;
}) {
  const visible = useMemo(
    () => electableMajorsFor(school, programOptions, programIds),
    [programOptions, programIds, school],
  );
  const otherOpen = customMajor !== null;
  const otherInput = useRef<HTMLInputElement>(null);
  const wasOther = useRef(otherOpen);

  useEffect(() => {
    if (otherOpen && !wasOther.current) otherInput.current?.focus();
    wasOther.current = otherOpen;
  }, [otherOpen]);

  return (
    <div className="flex flex-col items-center gap-4">
      <ChipWrap>
        {visible.map((option) => (
          <OptionChip
            key={option.id}
            isSelected={programIds.includes(option.id)}
            onPress={() => onToggleProgram(option.id)}
          >
            {option.name}
          </OptionChip>
        ))}
        <OptionChip
          isSelected={otherOpen}
          onPress={() => onCustomMajorChange(otherOpen ? null : "")}
        >
          Other
        </OptionChip>
      </ChipWrap>

      {otherOpen ? (
        <div className="w-full max-w-[320px]">
          <Input
            ref={otherInput}
            aria-label="Your major"
            placeholder="Type your major"
            maxLength={80}
            value={customMajor ?? ""}
            onChange={(value) => onCustomMajorChange(value)}
            size="medium"
          />
        </div>
      ) : null}
    </div>
  );
}

/** Minors only — pick one or more, or explicitly choose none. */
export function MinorsQuestion({
  school,
  programIds,
  programOptions,
  noneSelected,
  onSelectNone,
  onToggleMinor,
}: {
  school: School | null;
  programIds: readonly string[];
  programOptions: readonly ProgramOption[];
  noneSelected: boolean;
  onSelectNone: () => void;
  onToggleMinor: (programId: string) => void;
}) {
  const visible = useMemo(
    () => electableMinorsFor(school, programOptions, programIds),
    [programOptions, programIds, school],
  );

  const picked = new Set(programIds);

  return (
    <ChipWrap>
      <OptionChip isSelected={noneSelected} onPress={onSelectNone}>
        None
      </OptionChip>
      {visible.map((option) => {
        const isForeign = option.school !== school;
        return (
          <OptionChip
            key={option.id}
            isSelected={picked.has(option.id)}
            disabled={noneSelected}
            onPress={() => onToggleMinor(option.id)}
            sublabel={
              isForeign ? SCHOOL_LABEL[option.school as School] ?? option.school : undefined
            }
          >
            {option.name}
          </OptionChip>
        );
      })}
    </ChipWrap>
  );
}
