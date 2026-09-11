/**
 * Mutual exclusion, read forwards.
 *
 * `evaluateProgram` already honours `excludeGroups` backwards, against courses
 * the student has taken. This file is about the other direction: the audit
 * expands candidates for every outstanding group independently, so a course
 * that matches two groups which cannot both count it appears in both lists,
 * and anything counting those memberships reads one course as advancing two
 * requirements.
 *
 * The headline case is the last test in the first block. A chemistry course
 * carries `scienceB` and `scienceC`, the Core's two science categories select
 * on exactly those flags, and Category C names Category B in `excludeGroups` —
 * so before `exclusionKey` existed, one chemistry course looked like it closed
 * two requirements. It closes one.
 */

import { describe, expect, it } from "vitest";

import { CC_CORE } from "./programs/cc-core";
import { CC_MAJOR_COMPUTER_SCIENCE } from "./programs/cc-major-computer-science";
import { CC_MAJOR_HISTORY } from "./programs/cc-major-history";
import { evaluateProgram, exclusionKeysForProgram, type CourseFacts } from "./evaluate";
import { expandCandidates, inMemoryCandidateProvider, type CandidateCourse } from "./candidates";
import { toCourseId, type CourseId } from "./code";
import type { Program } from "./types";

const id = (code: string): CourseId => {
  const parsed = toCourseId(code);
  if (!parsed) throw new Error(`unparseable fixture code: ${code}`);
  return parsed;
};

/* ==========================================================================
 * The clusters themselves
 * ========================================================================== */

describe("exclusionKeysForProgram", () => {
  it("joins the Core's two science categories", () => {
    const keys = exclusionKeysForProgram(CC_CORE);
    expect(keys.get("science-b")).toBeDefined();
    expect(keys.get("science")).toBe(keys.get("science-b"));
  });

  it("leaves groups bound by nothing out of the map entirely", () => {
    const keys = exclusionKeysForProgram(CC_CORE);
    /*
     * Absent, not keyed-to-itself. A caller reading a missing entry as its own
     * private cluster is correct; one reading it as "excluded from everything"
     * would silently stop counting requirements that have no exclusion at all.
     */
    expect(keys.has("university-writing")).toBe(false);
    expect(keys.has("lit-hum")).toBe(false);
    expect(keys.has("art-hum")).toBe(false);
  });

  it("returns an empty map for a program that declares no exclusions", () => {
    expect(exclusionKeysForProgram(CC_MAJOR_HISTORY).size).toBe(0);
  });

  it("closes transitively over everything one selector names", () => {
    // `electives` names five groups; all six are one cluster.
    const keys = exclusionKeysForProgram(CC_MAJOR_COMPUTER_SCIENCE);
    const cluster = keys.get("electives");
    expect(cluster).toBeDefined();
    for (const memberId of [
      "data-structures",
      "core-sequence",
      "area-foundation",
      "linear-algebra",
      "probability-statistics",
    ]) {
      expect(keys.get(memberId), `${memberId} should share the electives cluster`).toBe(cluster);
    }
  });

  it("keys every member of a cluster, the naming member included", () => {
    /*
     * Regression: membership was first inferred from the union-find parent
     * map, which has no entry for a cluster's root — silently dropping exactly
     * one group per cluster, and always the one every other member points at.
     */
    const keys = exclusionKeysForProgram(CC_CORE);
    const clustered = [...keys.keys()].sort();
    expect(clustered).toEqual(["science", "science-b"]);
  });

  it("qualifies the key by program, because group ids repeat across programs", () => {
    /*
     * `data-structures`, `research-methods`, `linear-algebra` and nineteen
     * others are declared in more than one program. A student with two majors
     * must not have unrelated groups collapse into one cluster.
     */
    const cc = exclusionKeysForProgram(CC_MAJOR_COMPUTER_SCIENCE).get("data-structures");
    expect(cc).toContain(CC_MAJOR_COMPUTER_SCIENCE.id);
  });

  it("is stable when a program's groups are reordered", () => {
    const reversed: Program = { ...CC_CORE, groups: [...CC_CORE.groups].reverse() };
    expect(exclusionKeysForProgram(reversed).get("science")).toBe(
      exclusionKeysForProgram(CC_CORE).get("science"),
    );
  });

  it("ignores a dangling excludeGroups target rather than throwing", () => {
    const broken: Program = {
      ...CC_CORE,
      groups: [
        {
          id: "orphan",
          label: "Orphan",
          rule: { kind: "n_matching", n: 1, select: { flag: "scienceC", excludeGroups: ["nope"] } },
        },
      ],
    } as Program;
    expect(() => exclusionKeysForProgram(broken)).not.toThrow();
    expect(exclusionKeysForProgram(broken).size).toBe(0);
  });
});

/* ==========================================================================
 * Stamping, through the real expansion path
 * ========================================================================== */

const CHEMISTRY = id("CHEM UN1403");

const CATALOG: CandidateCourse[] = [
  {
    courseId: CHEMISTRY,
    code: "CHEM UN1403",
    title: "GENERAL CHEMISTRY I",
    points: 3.5,
    // The double flag that is the whole problem.
    requirementFlags: { scienceRequirement: true, scienceB: true, scienceC: true },
  },
  {
    courseId: id("ASTR UN1403"),
    code: "ASTR UN1403",
    title: "EARTH, MOON AND PLANETS",
    points: 3,
    requirementFlags: { scienceRequirement: true, scienceC: true },
  },
];

const provider = inMemoryCandidateProvider(CATALOG);

const lookup = (courseId: string): CourseFacts | undefined => {
  const found = CATALOG.find((entry) => entry.courseId === courseId);
  if (!found) return undefined;
  return {
    courseId,
    title: found.title,
    points: found.points,
    requirementFlags: found.requirementFlags,
  };
};

async function expandCore(taken: CourseId[] = []) {
  const evaluated = evaluateProgram(CC_CORE, {
    taken: taken.map((courseId) => ({ courseId, termCode: null, planned: false })),
    lookup,
  });
  return expandCandidates(evaluated, { provider });
}

describe("expandCandidates stamps the cluster", () => {
  it("marks both science categories with the same key", async () => {
    const expanded = await expandCore();
    const byId = new Map(expanded.groups.map((g) => [g.group.id, g]));
    const b = byId.get("science-b")!;
    const c = byId.get("science")!;
    expect(b.exclusionKey).toBeDefined();
    expect(c.exclusionKey).toBe(b.exclusionKey);
  });

  it("leaves unclustered groups undefined", async () => {
    const expanded = await expandCore();
    const writing = expanded.groups.find((g) => g.group.id === "university-writing")!;
    expect(writing.exclusionKey).toBeUndefined();
  });

  it("still expands chemistry into BOTH lists — the fix is in the counting", async () => {
    /*
     * Deliberately NOT filtered out of one list. `excludeGroups` removes what a
     * group actually consumed, not everything it could have drawn from, so
     * dropping chemistry from Category C would be advice that Category C is
     * unsatisfiable for a student whose only other option is a Category B
     * course. The course stays offered under both; it is credited once.
     */
    const expanded = await expandCore();
    const byId = new Map(expanded.groups.map((g) => [g.group.id, g]));
    expect(byId.get("science-b")!.candidates).toContain(CHEMISTRY);
    expect(byId.get("science")!.candidates).toContain(CHEMISTRY);
  });

  it("stamps groups it does not query, so a cluster is never half-marked", async () => {
    /*
     * The clusters that matter join an open-ended elective block to the
     * `all_of` core groups it refuses to re-count. `expandCandidates` returns
     * those early — they name their own courses — and an unstamped half would
     * leave the pair looking unrelated.
     */
    const evaluated = evaluateProgram(CC_MAJOR_COMPUTER_SCIENCE, { taken: [], lookup });
    const expanded = await expandCandidates(evaluated, { provider });
    const ds = expanded.groups.find((g) => g.group.id === "data-structures")!;
    const electives = expanded.groups.find((g) => g.group.id === "electives")!;
    expect(ds.group.rule.kind).not.toBe("n_matching");
    expect(ds.exclusionKey).toBe(electives.exclusionKey);
    expect(ds.exclusionKey).toBeDefined();
  });
});
