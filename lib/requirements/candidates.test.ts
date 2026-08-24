/**
 * Candidate generation for the open-ended rules.
 *
 * The headline case is the last test in the first block: a Columbia College
 * student who has taken no Global Core course gets a non-empty list of courses
 * that would clear it. That returned `[]` before this module existed, and `[]`
 * renders as a finished requirement — so this is the assertion that pins the
 * whole fix.
 */

import { describe, expect, it } from "vitest";

import { CC_CORE } from "./programs/cc-core";
import { evaluateProgram, type CourseFacts } from "./evaluate";
import type { GroupResult, ProgramResult } from "./types";
import {
  expandCandidates,
  inMemoryCandidateProvider,
  needsCandidateQuery,
  type CandidateCourse,
} from "./candidates";
import { toCourseId } from "./code";

/** A catalog just big enough to be interesting, in the shape a provider returns. */
const CATALOG: CandidateCourse[] = [
  // Global Core approved, and offered.
  mk("AFAS UN1001", "INTRO TO AFRICAN-AMER STUDIES", { globalCore: true }),
  mk("ASCE UN1359", "INTRO TO EAST ASIAN CIV: CHINA", { globalCore: true }),
  mk("AHUM UN1400", "COLLOQUIUM ON MAJOR TEXTS", { globalCore: true }),
  // Science approved.
  mk("ASTR UN1403", "EARTH, MOON AND PLANETS", { scienceRequirement: true, scienceC: true }),
  mk("BIOL UN2005", "INTRO BIOLOGY I", { scienceRequirement: true, scienceB: true }),
  // Flag-free courses that must never be offered for a flagged requirement.
  mk("COMS W3157", "ADVANCED PROGRAMMING", {}),
  mk("MATH UN1201", "CALCULUS III", {}),
  // Physical education, selected by subject rather than by flag.
  mk("PHED UN1001", "BEGINNING SWIMMING", {}),
  mk("PHED UN1012", "YOGA", {}),
];

function mk(
  code: string,
  title: string,
  requirementFlags: Record<string, boolean>,
): CandidateCourse {
  const courseId = toCourseId(code);
  if (!courseId) throw new Error(`test fixture has an unparseable code: ${code}`);
  return { courseId, code, title, points: 3, requirementFlags };
}

const LOOKUP = (courseId: string): CourseFacts | undefined => {
  const found = CATALOG.find((c) => c.courseId === courseId);
  if (!found) return undefined;
  return {
    courseId,
    title: found.title,
    points: found.points,
    requirementFlags: found.requirementFlags,
  };
};

const provider = inMemoryCandidateProvider(CATALOG);

function auditWith(codes: string[]) {
  return evaluateProgram(CC_CORE, {
    taken: codes.map((code) => ({
      courseId: toCourseId(code)!,
      termCode: null,
      planned: false,
    })),
    lookup: LOOKUP,
  });
}

function groupById(result: ProgramResult, id: string): GroupResult {
  const found = result.groups.find((g) => g.group.id === id);
  if (!found) throw new Error(`no group "${id}" in CC_CORE`);
  return found;
}

describe("candidate generation", () => {
  it("knows which rules need a query", () => {
    const audit = auditWith([]);
    // Global Core is `n_matching` — it needs one.
    expect(needsCandidateQuery(groupById(audit, "global-core"))).toBe(true);
    // Lit Hum is `all_of` — it already names its own courses.
    expect(needsCandidateQuery(groupById(audit, "lit-hum"))).toBe(false);
  });

  it("leaves the finite rules exactly as the audit computed them", async () => {
    const audit = auditWith([]);
    const before = groupById(audit, "lit-hum").candidates;
    expect(before.length).toBeGreaterThan(0);

    const expanded = await expandCandidates(audit, { provider });
    expect(groupById(expanded, "lit-hum").candidates).toEqual(before);
  });

  it("gives a CC student with no Global Core a non-empty candidate list", async () => {
    /*
     * THE case. Before `candidates.ts`, `evaluate.ts` returned `candidates: []`
     * for every `n_matching` rule, and the recommender read that field — so the
     * requirement a student is least able to research on their own was the one
     * the app could say nothing about. An empty list is not a neutral outcome
     * on screen: it reads as "nothing left to take".
     */
    const audit = auditWith([]);
    expect(groupById(audit, "global-core").candidates).toEqual([]);

    const expanded = await expandCandidates(audit, { provider });
    const candidates = groupById(expanded, "global-core").candidates;

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates).toContain(toCourseId("AFAS UN1001"));
    expect(candidates).toContain(toCourseId("ASCE UN1359"));
  });

  it("never offers a course the audit would refuse to count", async () => {
    /*
     * The failure mode this guards is the nastiest one available here: suggest
     * a course, the student takes it, and the requirement stays red because the
     * query and the predicate disagreed about what the selector meant.
     */
    const expanded = await expandCandidates(auditWith([]), { provider });
    const candidates = groupById(expanded, "global-core").candidates;

    expect(candidates).not.toContain(toCourseId("COMS W3157"));
    expect(candidates).not.toContain(toCourseId("MATH UN1201"));

    // Every candidate, re-audited on its own, must actually move the group.
    for (const courseId of candidates) {
      const after = evaluateProgram(CC_CORE, {
        taken: [{ courseId, termCode: null, planned: false }],
        lookup: LOOKUP,
      });
      expect(groupById(after, "global-core").completed).toBe(1);
    }
  });

  it("excludes courses the student has already taken", async () => {
    const audit = auditWith(["AFAS UN1001"]);
    const expanded = await expandCandidates(audit, {
      provider,
      exclude: [toCourseId("AFAS UN1001")!],
    });

    const candidates = groupById(expanded, "global-core").candidates;
    expect(candidates).not.toContain(toCourseId("AFAS UN1001"));
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("skips groups that are already satisfied", async () => {
    // Two Global Core courses finishes the rule.
    const audit = auditWith(["AFAS UN1001", "ASCE UN1359"]);
    expect(groupById(audit, "global-core").status).toBe("satisfied");

    const expanded = await expandCandidates(audit, { provider });
    // No query, so no candidates — correct, and the reason is "you are done",
    // which the status already says.
    expect(groupById(expanded, "global-core").candidates).toEqual([]);
  });

  it("resolves a subject-shaped selector, not just a flag-shaped one", async () => {
    const expanded = await expandCandidates(auditWith([]), { provider });
    const pe = groupById(expanded, "physical-education").candidates;

    expect(pe).toContain(toCourseId("PHED UN1001"));
    expect(pe).not.toContain(toCourseId("COMS W3157"));
  });

  it("respects the limit", async () => {
    const expanded = await expandCandidates(auditWith([]), { provider, limit: 1 });
    expect(groupById(expanded, "global-core").candidates).toHaveLength(1);
  });
});

describe("selector honesty", () => {
  it("refuses a flagged requirement to a course with no catalog record", async () => {
    /*
     * A transcript row we cannot resolve carries no flags, and "we have never
     * seen this course" must never round up to "it satisfies Global Core".
     * This is the same rule the audit applies; the shared predicate is what
     * makes both directions agree.
     */
    const audit = evaluateProgram(CC_CORE, {
      taken: [{ courseId: "XXXX9999UN", termCode: null, planned: false }],
      lookup: () => undefined,
    });
    expect(groupById(audit, "global-core").completed).toBe(0);
  });
});
