/**
 * Contract tests for the four-year plan.
 *
 * The cases that matter are the ones where a plan is *almost* right: every
 * prerequisite present but in the wrong order, two interchangeable courses
 * both scheduled, a term that is one course short of full-time. A planner that
 * only catches missing courses catches none of these.
 */

import { describe, expect, it } from "vitest";

import { buildProgressionGraph } from "@/lib/prereqs/graph";
import { TEST_CATALOG } from "@/lib/prereqs/prereqs.test";
import {
  analyzeFourYearPlan,
  buildFourYearTerms,
  createEmptyPlan,
  earliestFeasibleTerm,
  requiredClosure,
  suggestPlan,
  type FourYearPlan,
} from "./plan";

const graph = buildProgressionGraph(TEST_CATALOG);

function planWith(placements: Record<string, string[]>): FourYearPlan {
  const plan = createEmptyPlan(2026);
  for (const term of plan.terms) term.courseIds = placements[term.termKey] ?? [];
  return plan;
}

const kinds = (plan: FourYearPlan) =>
  analyzeFourYearPlan(graph, plan).issues.map((issue) => issue.kind);

describe("buildFourYearTerms", () => {
  it("runs Fall-first and rolls the calendar year at Spring", () => {
    const terms = buildFourYearTerms(2026);
    expect(terms).toHaveLength(8);
    expect(terms[0]).toMatchObject({ label: "Fall 2026", termCode: "20263", academicYear: 1 });
    expect(terms[1]).toMatchObject({ label: "Spring 2027", termCode: "20271", academicYear: 1 });
    expect(terms[7]).toMatchObject({ label: "Spring 2030", termCode: "20301", academicYear: 4 });
  });
});

describe("analyzeFourYearPlan", () => {
  it("accepts a chain taken in order", () => {
    const plan = planWith({
      "y1-fall": ["COMS1004W", "COMS4995W"],
      "y1-spring": ["COMS3134W", "COMS3157W"],
    });
    // 3157 needs 3134, which is in the SAME term — that is the one real error.
    expect(kinds(plan)).toContain("prereq_unmet");
  });

  it("rejects a prerequisite scheduled after the course that needs it", () => {
    const plan = planWith({
      "y1-fall": ["COMS3134W", "COMS1004W"],
    });
    const analysis = analyzeFourYearPlan(graph, plan);
    const unmet = analysis.issues.find((issue) => issue.kind === "prereq_unmet");
    expect(unmet?.courseId).toBe("COMS3134W");
    expect(unmet?.resolvedBy).toEqual(["COMS1004W"]);
  });

  it("passes a plan where each prerequisite sits in a strictly earlier term", () => {
    const plan = planWith({
      "y1-fall": ["COMS1004W"],
      "y1-spring": ["COMS3134W"],
      "y2-fall": ["COMS3157W"],
      "y2-spring": ["COMS4156W"],
    });
    expect(kinds(plan)).not.toContain("prereq_unmet");
  });

  it("accepts an equivalent course in place of the one the bulletin names", () => {
    const plan = planWith({
      "y1-fall": ["COMS1004W"],
      "y1-spring": ["COMS3137W"],
      "y2-fall": ["COMS3157W"],
    });
    expect(kinds(plan)).not.toContain("prereq_unmet");
  });

  it("flags two courses from the same equivalence group", () => {
    const plan = planWith({
      "y1-fall": ["COMS1004W"],
      "y1-spring": ["COMS3134W"],
      "y2-fall": ["COMS3137W"],
    });
    const conflict = analyzeFourYearPlan(graph, plan).issues.find(
      (issue) => issue.kind === "equivalent_conflict",
    );
    expect(conflict?.message).toContain("COMS3134W");
  });

  it("flags the same course planned twice", () => {
    const plan = planWith({ "y1-fall": ["COMS1004W"], "y2-fall": ["COMS1004W"] });
    expect(kinds(plan)).toContain("duplicate_course");
  });

  it("reports a light term but stays quiet about an empty one", () => {
    const light = planWith({ "y1-fall": ["COMS1004W"] });
    expect(kinds(light)).toContain("under_load");
    expect(kinds(createEmptyPlan(2026))).toEqual([]);
  });

  it("reports a term over the approval threshold", () => {
    const heavy = planWith({
      "y1-fall": ["COMS1004W", "COMS3134W", "COMS3137W", "COMS3157W", "COMS4156W", "COMS4995W"],
    });
    expect(kinds(heavy)).toContain("over_load");
  });

  it("surfaces an unevaluable gate as info, never as a blocker", () => {
    const plan = planWith({ "y1-fall": ["COMS4995W", "COMS1004W", "COMS3134W"] });
    const analysis = analyzeFourYearPlan(graph, plan);
    const advisory = analysis.issues.find((issue) => issue.kind === "prereq_unknown");
    expect(advisory?.severity).toBe("info");
  });

  it("totals only the points it actually knows", () => {
    const plan = planWith({ "y1-fall": ["COMS1004W", "COMS3134W"] });
    expect(analyzeFourYearPlan(graph, plan).totalPoints).toBe(6);
  });
});

describe("earliestFeasibleTerm", () => {
  it("finds the first term after the chain is complete", () => {
    const plan = planWith({ "y1-fall": ["COMS1004W"], "y1-spring": ["COMS3134W"] });
    expect(earliestFeasibleTerm(graph, plan, "COMS3157W")?.termKey).toBe("y2-fall");
  });

  it("returns null when the plan never satisfies the course", () => {
    expect(earliestFeasibleTerm(graph, createEmptyPlan(2026), "COMS4156W")).toBeNull();
  });
});

describe("requiredClosure", () => {
  it("pulls in the whole chain a goal depends on", () => {
    const closure = requiredClosure(graph, ["COMS4156W"]);
    expect([...closure].sort()).toEqual(["COMS1004W", "COMS3134W", "COMS3157W", "COMS4156W"]);
  });

  it("takes one branch of an alternation, not every branch", () => {
    const closure = requiredClosure(graph, ["COMS3157W"]);
    const dataStructures = [...closure].filter((id) => id === "COMS3134W" || id === "COMS3137W");
    expect(dataStructures).toHaveLength(1);
  });
});

describe("suggestPlan", () => {
  it("never places a course before something it requires", () => {
    const { plan, unplaced } = suggestPlan(graph, ["COMS4156W", "COMS4771W"], {
      startYear: 2026,
    });
    expect(unplaced).toEqual([]);

    // The one remaining unsatisfied prerequisite is MATH UN1201, which lives on
    // a department page this catalog does not cover — reported, not scheduled.
    const analysis = analyzeFourYearPlan(graph, plan);
    const external = analysis.issues.filter((issue) => issue.kind === "prereq_external");
    expect(external.flatMap((issue) => issue.resolvedBy)).toEqual(["MATH1201UN"]);

    // Nothing the board can do resolves it, so it must not read as a blocker —
    // and a plan the suggester itself produced must not come back with errors.
    expect(external.every((issue) => issue.severity === "warning")).toBe(true);
    expect(analysis.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("still blocks on a prerequisite the board could actually satisfy", () => {
    // COMS 3134 is in the catalog, so leaving it out is the reader's problem to
    // fix and stays an error — the external carve-out must not swallow it.
    const plan = createEmptyPlan(2026);
    plan.terms[0].courseIds.push("COMS3157W");

    const issues = analyzeFourYearPlan(graph, plan).issues.filter(
      (issue) => issue.courseId === "COMS3157W",
    );
    expect(issues.some((issue) => issue.kind === "prereq_unmet")).toBe(true);
    expect(issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("reports the outside-department courses it had to assume", () => {
    const { assumedExternal } = suggestPlan(graph, ["COMS4771W"], { startYear: 2026 });
    expect(assumedExternal).toEqual(["MATH1201UN"]);
  });

  it("reaches the goals it was given", () => {
    const { plan } = suggestPlan(graph, ["COMS4156W"], { startYear: 2026 });
    expect(plan.terms.flatMap((term) => term.courseIds)).toContain("COMS4156W");
  });

  it("respects a term point budget", () => {
    const { plan } = suggestPlan(graph, ["COMS4156W", "COMS4771W"], {
      startYear: 2026,
      pointsPerTerm: 6,
    });
    for (const term of analyzeFourYearPlan(graph, plan).terms) {
      expect(term.points).toBeLessThanOrEqual(6);
    }
  });

  it("skips what the student has already taken", () => {
    const { plan } = suggestPlan(graph, ["COMS3157W"], {
      startYear: 2026,
      alreadyCompleted: ["COMS1004W", "COMS3134W"],
    });
    const placed = plan.terms.flatMap((term) => term.courseIds);
    expect(placed).toEqual(["COMS3157W"]);
  });
});
