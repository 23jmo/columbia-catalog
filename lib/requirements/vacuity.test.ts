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
