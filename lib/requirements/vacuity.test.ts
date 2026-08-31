/**
 * No requirement may be satisfied by the coursework another requirement
 * already claimed.
 *
 * ── The bug this exists to prevent ─────────────────────────────────────────
 *
 * Found 2026-08-24, in both computer science majors. Every course in the CS
 * Core is a COMS or CSEE course at the 3000 level or above, which is exactly
 * what the "any four COMS courses at the 3000 level or above" elective selector
 * matched. So a SEAS CS student who had completed the entire required
 * curriculum and taken zero electives was scored 12/12 and told the requirement
 * was DONE.
 *
 * The audit's whole job is to be trusted about that. An audit that
 * under-counts is self-correcting — a student sees a low number, takes another
 * course, loses nothing. An audit that over-counts is discovered by the
 * registrar after the add/drop deadline, and by then it has cost someone a
 * semester.
 *
 * Six of fifteen programs had some form of it. Economics and Biomedical
 * Engineering did not, because they had already excluded their required
 * coursework by hand — which is what made the inconsistency findable at all.
 *
 * ── How the check works ────────────────────────────────────────────────────
 *
 * For each program, build a student holding EXACTLY the courses the program's
 * closed rules name — every `all_of`, and the first option of every choice —
 * and nothing else. Then evaluate. Any open-ended group that reports progress
 * is being fed by coursework it does not own, because this student has taken
 * nothing toward it.
 *
 * This is a screen rather than a verdict, and the allowlist below is the part
 * that makes it honest: some requirements genuinely ARE cumulative totals.
 */

import { describe, expect, it } from "vitest";

import { toCourseId, type CourseId } from "./code";
import { evaluateProgram, type CourseFacts, type TakenCourseInput } from "./evaluate";
import { AUTHORED_PROGRAMS } from "./programs";
import type { RequirementGroup } from "./types";

/**
 * Groups that legitimately count coursework claimed elsewhere, with the
 * Bulletin's own wording for why.
 *
 * A record rather than a list of ids so that adding an entry costs a sentence
 * of justification. Silencing this test is meant to be slightly annoying — the
 * failure it reports is a student being told they have finished something they
 * have not started, and "it was noisy" is not a reason to allow one.
 *
 * Both entries were checked against the live Bulletin on 2026-08-24.
 */
const CUMULATIVE_BY_DESIGN: Record<string, string> = {
  "cc-major-psychology:eleven-courses":
    'The group is labelled "Eleven courses total" and the Bulletin says the eleven are ' +
    '"including everything above". The required PSYC courses are meant to be among them.',
  "cc-major-english:ten-courses":
    'The Bulletin reads "At least 10 courses in English and Comparative Literature". ' +
    "ENGL UN2000 is the first of the ten, not an eleventh course alongside them.",
  "cc-major-philosophy:thirty-points":
    'The Bulletin reads "At least 30 points in philosophy ... including:" and then lists ' +
    "the six named requirements. They are the first of the thirty points, not thirty more " +
    "beside them — the six come to 21-23 points, so this block is what the other two or " +
    "three courses live in. Checked against the live Bulletin on 2026-08-26.",
  "bc-major-history:eleven-courses":
    'Barnard\'s catalogue reads "The History major consists of eleven courses: six in the ' +
    'area of concentration; the other five may be either within or without", and then ' +
    '"The eleven required courses should include:" followed by the introductory lectures, ' +
    "the two seminars and the two-semester senior research seminar. HIST BC3391 and " +
    "HIST BC3392 are the eleventh and tenth of the eleven, not two more beside them. " +
    "Checked against catalog.barnard.edu on 2026-08-30.",
};

/**
 * Courses deliberately listed in two closed groups at once, with the reason.
 *
 * Same shape and same rule as `CUMULATIVE_BY_DESIGN`: an entry costs a
 * sentence, because the default answer is that this is a bug.
 *
 * Checked against the live Bulletin on 2026-08-24.
 */
const DOUBLE_COUNTED_BY_DESIGN: Record<string, string> = {
  "cc-major-computer-science:MATH UN2015":
    'The department publishes an explicit permission: "Math 2015 Linear Algebra and ' +
    'Probability may simultaneously satisfy both linear algebra and probability ' +
    'requirements". It is the one course in the major allowed to do so.',
  "seas-major-computer-science:MATH UN2015":
    "The same published permission, and the same two groups — SEAS and CC share the " +
    "department's mathematics requirement verbatim.",
  "bc-major-computer-science:MATH UN2015":
    "Barnard publishes the permission in its own words, on its own catalogue, under the " +
    'trackless curriculum\'s mathematics table: "MATH UN2015 can double count for Linear ' +
    'Algebra and Probability requirements. This is the ONLY instance a course can double ' +
    'count." Deliberately NOT excluded between the two groups, because the usual guard ' +
    "would tell a student who took UN2015 that she still owes a probability course. " +
    "Checked against catalog.barnard.edu on 2026-08-30.",
};

/** Courses a group requires by name — what a student must hold to satisfy it. */
function namedCourses(group: RequirementGroup): string[] {
  const rule = group.rule;
  if (rule.kind === "all_of") return rule.courses;
  // Any single option exposes the same overlap, so the first will do.
  if (rule.kind === "n_of") return rule.courses.slice(0, rule.n);
  if (rule.kind === "sequence_choice") return rule.sequences[0]?.courses ?? [];
  return [];
}

function isOpenEnded(group: RequirementGroup): boolean {
  return group.rule.kind === "n_matching" || group.rule.kind === "points_matching";
}

/**
 * Three points for every course, and no requirement flags.
 *
 * Synthetic rather than loaded from the catalog so the test runs offline. The
 * signal being measured is "did this group count anything at all", and a real
 * points value would change the size of a wrong number without changing whether
 * it is wrong. Flag-based selectors match nothing here, so a group gated purely
 * on `flag` is out of this test's reach — those cannot absorb a named course by
 * subject or level anyway, which is the failure being screened for.
 */
const syntheticFacts = (courseId: CourseId): CourseFacts => ({
  courseId,
  title: courseId,
  points: 3,
  requirementFlags: {},
});

describe("no requirement is satisfied by another requirement's coursework", () => {
  for (const program of AUTHORED_PROGRAMS) {
    const openEnded = program.groups.filter(isOpenEnded);
    if (openEnded.length === 0) continue;

    it(`${program.id}: open-ended groups start empty`, () => {
      const requiredIds = [
        ...new Set(program.groups.filter((group) => !isOpenEnded(group)).flatMap(namedCourses)),
      ]
        .map((code) => toCourseId(code))
        .filter((courseId): courseId is CourseId => Boolean(courseId));

      const taken: TakenCourseInput[] = requiredIds.map((courseId) => ({
        courseId,
        termCode: null,
        planned: false,
        points: 3,
      }));

      const result = evaluateProgram(program, { taken, lookup: syntheticFacts });

      const absorbing = result.groups
        .filter((group) => isOpenEnded(group.group) && group.completed > 0)
        .filter((group) => !(`${program.id}:${group.group.id}` in CUMULATIVE_BY_DESIGN))
        .map(
          (group) =>
            `${group.group.id} counted ${group.completed}/${group.required} ${group.unit} ` +
            `from [${group.matched.map((match) => match.code).join(", ")}] — ` +
            `courses this student took for other requirements`,
        );

      // Named rather than counted: the fix is always in one program file, and
      // the message should say which group and which courses without anyone
      // having to reproduce the setup.
      expect(absorbing).toEqual([]);
    });
  }

  it("every allowlisted group still exists and still absorbs", () => {
    /*
     * Guards the allowlist against rot in both directions. An entry naming a
     * group that has been renamed silently stops protecting anything, and an
     * entry for a group that no longer absorbs is a permanently open door for
     * a future edit to walk through.
     */
    for (const key of Object.keys(CUMULATIVE_BY_DESIGN)) {
      const [programId, groupId] = key.split(":");
      const program = AUTHORED_PROGRAMS.find((candidate) => candidate.id === programId);
      expect(program, `allowlist names an unknown program: ${programId}`).toBeDefined();
      expect(
        program!.groups.some((group) => group.id === groupId),
        `allowlist names an unknown group: ${key}`,
      ).toBe(true);
    }
  });

  it("gives a reason for every allowlisted group", () => {
    for (const [key, reason] of Object.entries(CUMULATIVE_BY_DESIGN)) {
      expect(reason.length, `${key} needs a real justification`).toBeGreaterThan(40);
    }
  });
});

/* ==========================================================================
 * The same bug, one rule kind over
 * ========================================================================== */

/**
 * No course may sit in two closed groups of the same program.
 *
 * ── Why the test above could not catch this ────────────────────────────────
 *
 * Found 2026-08-24 in `cc-major-biology`, immediately after the check above
 * was written and passed. The Bulletin asks for two core courses from one list
 * and "two ADDITIONAL courses" from another, and seven courses appear on both
 * lists. A student holding exactly two of those seven scored 2/2 on each and
 * was told both requirements were finished, having taken half the coursework.
 *
 * The check above screens open-ended groups — `n_matching` and
 * `points_matching` — because those are the ones that absorb by subject and
 * level. This failure is between two CLOSED `n_of` rules, so there is no
 * open-ended group involved and nothing for it to report. Worse, exclusivity
 * is opt-in through `excludeGroups`, which lives on a *selector*; a closed
 * `n_of` names its courses outright and therefore has no way to express "but
 * not the ones that group already used" even when the author wants to.
 *
 * ── Structural, not evaluative ─────────────────────────────────────────────
 *
 * This one reads the program files rather than running a student through them,
 * because the defect is present whether or not anybody happens to hold the
 * shared course. `crossCountedCourseIds` already reports cross-counting at
 * audit time, but that fires only for a student who actually triggers it, and
 * it tells them after the fact rather than stopping the file being written.
 *
 * Two hits across fifteen programs, both allowlisted above, both cases where
 * the department publishes the permission in writing. That the signal is this
 * quiet is the argument for keeping it: a third hit means somebody has made
 * biology's mistake again.
 */
describe("no course sits in two closed groups of one program", () => {
  /** Everything a closed rule could count. Selector-based rules return null. */
  function closedOptions(group: RequirementGroup): string[] | null {
    const rule = group.rule;
    if (rule.kind === "all_of" || rule.kind === "n_of") return rule.courses;
    // Every branch, not just the first: a course in ANY branch is countable.
    if (rule.kind === "sequence_choice") return rule.sequences.flatMap((seq) => seq.courses);
    return null;
  }

  for (const program of AUTHORED_PROGRAMS) {
    it(`${program.id}: every named course belongs to one group`, () => {
      const groupsByCourse = new Map<string, string[]>();
      for (const group of program.groups) {
        const options = closedOptions(group);
        if (!options) continue;
        // Deduplicated per group: a course listed twice inside ONE rule is a
        // different (and harmless) sort of untidiness.
        for (const course of new Set(options)) {
          groupsByCourse.set(course, [...(groupsByCourse.get(course) ?? []), group.id]);
        }
      }

      const doubleCounted = [...groupsByCourse.entries()]
        .filter(([, groupIds]) => groupIds.length > 1)
        .filter(([course]) => !(`${program.id}:${course}` in DOUBLE_COUNTED_BY_DESIGN))
        .map(
          ([course, groupIds]) =>
            `${course} is countable by ${groupIds.join(" and ")} — one course, two ` +
            "requirements, and nothing stops a student satisfying both with it",
        );

      expect(doubleCounted).toEqual([]);
    });
  }

  it("every allowlisted double-count still exists, and still doubles", () => {
    for (const key of Object.keys(DOUBLE_COUNTED_BY_DESIGN)) {
      const separator = key.indexOf(":");
      const programId = key.slice(0, separator);
      const course = key.slice(separator + 1);

      const program = AUTHORED_PROGRAMS.find((candidate) => candidate.id === programId);
      expect(program, `allowlist names an unknown program: ${programId}`).toBeDefined();

      const holders = program!.groups.filter((group) => {
        const rule = group.rule;
        if (rule.kind === "all_of" || rule.kind === "n_of") return rule.courses.includes(course);
        if (rule.kind === "sequence_choice") {
          return rule.sequences.some((seq) => seq.courses.includes(course));
        }
        return false;
      });

      // An entry that no longer describes a real overlap is a door left open
      // for the next edit to walk through unnoticed.
      expect(
        holders.length,
        `${key} is allowlisted but ${course} is now in ${holders.length} closed group(s)`,
      ).toBeGreaterThan(1);
    }
  });

  it("gives a reason for every allowlisted double-count", () => {
    for (const [key, reason] of Object.entries(DOUBLE_COUNTED_BY_DESIGN)) {
      expect(reason.length, `${key} needs a real justification`).toBeGreaterThan(40);
    }
  });
});
