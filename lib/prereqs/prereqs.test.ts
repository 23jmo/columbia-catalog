/**
 * Contract tests for the prerequisite lane.
 *
 * Every string in the "real bulletin prose" block is copied verbatim out of
 * `lib/ingest/__fixtures__/bulletin-cs.html`. That is the point: these are not
 * examples chosen to be easy, they are the four shapes Columbia actually
 * publishes, including the one that is internally contradictory.
 */

import { describe, expect, it } from "vitest";

import {
  buildEquivalenceIndex,
  extractEquivalenceGroups,
  mergeEquivalenceGroups,
} from "./equivalence";
import { courseIdsIn, parsePrerequisiteText } from "./parse";
import { buildCanonicalIndex, canonicalizeCourseId } from "./canonical";
import {
  ancestors,
  buildProgressionGraph,
  descendants,
  evaluatePrereqTree,
  evaluateCourse,
  neighbourhood,
  newlyUnlockedBy,
} from "./graph";
import type { PrereqCatalog, PrereqNode } from "./types";

/** Compact rendering so an expectation reads like the prose it came from. */
function render(node: PrereqNode | null): string {
  if (!node) return "-";
  if (node.kind === "course") return node.courseId;
  if (node.kind === "advisory") return `~${node.text}~`;
  return `(${node.children.map(render).join(node.kind === "all" ? " AND " : " OR ")})`;
}

const parse = (text: string, subject = "COMS") =>
  parsePrerequisiteText("TEST", text, { defaultSubject: subject });

describe("parsePrerequisiteText — real bulletin prose", () => {
  it("reads a parenthesised alternation and drops the restatement that follows it", () => {
    const result = parse(
      "Prerequisites: (COMS W3134) or (COMS W3137) COMS W3134 OR COMS W3137",
    );
    expect(render(result?.tree ?? null)).toBe("(COMS3134W OR COMS3137W)");
    expect(result?.confidence).toBe("structured");
  });

  it("keeps a trailing conjunct that introduces a course the group did not", () => {
    // COMS W4771. The tail is NOT a restatement: W3203 and W3134 are new, and
    // dropping them would understate the requirement by two courses.
    const result = parse(
      "Prerequisites: (MATH UN1201 or MATH UN1205 or APMA E2000) and (COMS W3251 or MATH UN2010) " +
        "and COMS W3203 and COMS W3134 General mathematical maturity.",
    );
    const ids = courseIdsIn(result?.tree ?? null);
    expect(ids).toContain("COMS3203W");
    expect(ids).toContain("COMS3134W");
    expect(result?.advisories.join(" ")).toContain("General mathematical maturity");
  });

  it("does not repeat a course inside parentheses as a restatement", () => {
    // COMS W3770 names MATH UN2015 in two different groups. Both are real.
    const result = parse(
      "Prerequisites: (MATH UN2010 or MATH UN2015 or APMA E2101) and " +
        "(STAT UN1201 or MATH UN2015 or IEOR E3658)",
    );
    expect(render(result?.tree ?? null)).toBe(
      "((MATH2010UN OR MATH2015UN OR APMA2101E) AND (STAT1201UN OR MATH2015UN OR IEOR3658E))",
    );
  });

  it("never reads the connector 'OR' as a subject code", () => {
    // "COMS W3136 OR W3137" once produced a course called OR3137W.
    const result = parse("Prerequisites: (COMS W3134) or COMS W3136 OR W3137");
    expect(courseIdsIn(result?.tree ?? null).every((id) => !id.startsWith("OR"))).toBe(true);
  });

  it("lifts an instructor override off the tree instead of into it", () => {
    const result = parse("Prerequisites: (COMS W3134); or the instructor's permission.");
    expect(result?.instructorPermission).toBe(true);
    expect(render(result?.tree ?? null)).toBe("COMS3134W");
  });

  it("keeps unmachinable prose as an advisory rather than discarding it", () => {
    const result = parse("Prerequisites: (COMS W1004) or COMS W1004; Knowledge of Java");
    expect(render(result?.tree ?? null)).toBe("COMS1004W");
    expect(result?.advisories).toEqual(["Knowledge of Java"]);
    expect(result?.confidence).toBe("partial");
  });

  it("reports prose-only prerequisites as prose, with no tree at all", () => {
    const result = parse("Prerequisites: Obtained internship and approval from faculty advisor");
    expect(result?.tree).toBeNull();
    expect(result?.confidence).toBe("prose");
    expect(result?.advisories).toContain("Obtained internship");
  });

  it("separates corequisites from prerequisites", () => {
    const result = parse(
      "Prerequisites: (COMS W3203) Corequisites: COMS W3134, COMS W3136, COMS W3137",
    );
    expect(render(result?.tree ?? null)).toBe("COMS3203W");
    expect(courseIdsIn(result?.corequisites ?? null)).toHaveLength(3);
  });

  it("resolves a bare number against the subject of the course being read", () => {
    // The parser supplies the subject it was given and nothing more: "3137"
    // carries no qualifier, so it stays `COMS3137`. Finishing the id is
    // `canonicalizeCourseId`'s job, because only it knows which courses exist.
    const result = parse("Prerequisites: (W3134) or 3137", "COMS");
    expect(courseIdsIn(result?.tree ?? null)).toEqual(["COMS3134W", "COMS3137"]);

    const index = buildCanonicalIndex(["COMS3134W", "COMS3137W"]);
    expect(canonicalizeCourseId("COMS3137", index)).toBe("COMS3137W");
  });

  it("returns null for an empty prerequisite rather than an empty tree", () => {
    expect(parse("")).toBeNull();
    expect(parse("   ")).toBeNull();
  });
});

describe("equivalence groups", () => {
  const NOTE =
    "Note: Due to significant overlap, students may receive credit for only one of the " +
    "following three courses: COMS W3134, COMS W3136, COMS W3137.";

  it("reads a mutual-exclusion note out of a description", () => {
    const [group] = extractEquivalenceGroups(NOTE, "COMS");
    expect(group.courseIds).toEqual(["COMS3134W", "COMS3136W", "COMS3137W"]);
  });

  it("resolves the abbreviated members the bulletin uses elsewhere", () => {
    const [group] = extractEquivalenceGroups(
      "students may only receive credit for either COMS W3134, W3136, or W3137",
      "COMS",
    );
    expect(group.courseIds).toEqual(["COMS3134W", "COMS3136W", "COMS3137W"]);
  });

  it("does not run past the end of the list into the schedule table", () => {
    const [group] = extractEquivalenceGroups(
      "only one of COMS 4160 or Barnard COMS 3160BC may be taken for credit. " +
        "Fall 2026: COMS W4160 Course Number 13656 4111 3134",
      "COMS",
    );
    expect(group.courseIds).toEqual(["COMS3160BC", "COMS4160"]);
  });

  it("unions the partial views three descriptions give of one group", () => {
    const merged = mergeEquivalenceGroups([
      ...extractEquivalenceGroups("credit for only one of COMS W3134 or COMS W3136", "COMS"),
      ...extractEquivalenceGroups("credit for only one of COMS W3136 or COMS W3137", "COMS"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].courseIds).toEqual(["COMS3134W", "COMS3136W", "COMS3137W"]);
  });

  it("collapses an AND across equivalents into the alternation it must be", () => {
    // COMS W4111, published as an AND of three interchangeable courses.
    const index = buildEquivalenceIndex(mergeEquivalenceGroups(extractEquivalenceGroups(NOTE, "COMS")));
    const result = parsePrerequisiteText(
      "COMS4111W",
      "Prerequisites: (COMS W3134) and (COMS W3136) and (COMS W3137)",
      { defaultSubject: "COMS", equivalenceOf: (id) => index.get(id) },
    );
    expect(render(result?.tree ?? null)).toBe("(COMS3134W OR COMS3136W OR COMS3137W)");
  });

  it("leaves an ordinary conjunction of unrelated courses alone", () => {
    const index = buildEquivalenceIndex(mergeEquivalenceGroups(extractEquivalenceGroups(NOTE, "COMS")));
    const result = parsePrerequisiteText(
      "COMS4152W",
      "Prerequisites: (COMS W3134) and (COMS W3157) and (CSEE W3827)",
      { defaultSubject: "COMS", equivalenceOf: (id) => index.get(id) },
    );
    expect(render(result?.tree ?? null)).toBe("(COMS3134W AND COMS3157W AND CSEE3827W)");
  });
});

describe("canonicalizeCourseId", () => {
  const index = buildCanonicalIndex(["COMS1004W", "COMS4160W", "COMS3160BC"]);

  it("resolves an unqualified reference to the course that exists", () => {
    expect(canonicalizeCourseId("COMS1004", index)).toBe("COMS1004W");
    expect(canonicalizeCourseId("COMS4160", index)).toBe("COMS4160W");
  });

  it("leaves a reference to an unknown course untouched", () => {
    expect(canonicalizeCourseId("MATH1201UN", index)).toBe("MATH1201UN");
  });

  it("refuses to guess when a number carries two different qualifiers", () => {
    const ambiguous = buildCanonicalIndex(["COMS4115W", "COMS4115E"]);
    expect(canonicalizeCourseId("COMS4115", ambiguous)).toBe("COMS4115");
  });
});

// ---------------------------------------------------------------------------

/**
 * A miniature catalog with the shape that matters: a chain (1004 → 3134 →
 * 3157 → 4156), an alternation, an external reference, and an equivalence
 * group.
 */
const FIXTURE: PrereqCatalog = {
  source: "test",
  builtAt: "2026-01-01",
  equivalenceGroups: [
    { courseIds: ["COMS3134W", "COMS3137W"], sourceText: "credit for only one" },
  ],
  courses: [
    course("COMS1004W", "Intro to CS", 3, null),
    course("COMS3134W", "Data Structures", 3, {
      tree: { kind: "course", courseId: "COMS1004W", label: "COMS W1004" },
    }),
    course("COMS3137W", "Honors Data Structures", 4, {
      tree: { kind: "course", courseId: "COMS1004W", label: "COMS W1004" },
    }),
    course("COMS3157W", "Advanced Programming", 4, {
      tree: {
        kind: "any",
        children: [
          { kind: "course", courseId: "COMS3134W", label: "COMS W3134" },
          { kind: "course", courseId: "COMS3137W", label: "COMS W3137" },
        ],
      },
    }),
    course("COMS4156W", "Advanced Software Engineering", 3, {
      tree: { kind: "course", courseId: "COMS3157W", label: "COMS W3157" },
    }),
    course("COMS4771W", "Machine Learning", 3, {
      tree: {
        kind: "all",
        children: [
          { kind: "course", courseId: "COMS3134W", label: "COMS W3134" },
          { kind: "course", courseId: "MATH1201UN", label: "MATH UN1201" },
        ],
      },
    }),
    course("COMS4995W", "Topics", 3, {
      tree: { kind: "advisory", text: "Varies by section" },
      advisories: ["Varies by section"],
      confidence: "prose",
    }),
  ],
};

function course(
  courseId: string,
  title: string,
  points: number,
  prereq: Partial<import("./types").PrereqRequirement> | null,
): import("./types").ProgressionCourse {
  const subjectCode = /^[A-Z]{2,5}/.exec(courseId)?.[0] ?? "COMS";
  return {
    courseId,
    subjectCode,
    number: Number(/\d{4}/.exec(courseId)?.[0] ?? 0),
    qualifier: courseId.replace(/^[A-Z]{2,5}\d{4}/, "") || null,
    title,
    points,
    equivalents:
      courseId === "COMS3134W" ? ["COMS3137W"] : courseId === "COMS3137W" ? ["COMS3134W"] : [],
    prereq: prereq
      ? {
          courseId,
          rawText: "test",
          tree: null,
          corequisites: null,
          instructorPermission: false,
          advisories: [],
          confidence: "structured",
          ...prereq,
        }
      : null,
  };
}

describe("buildProgressionGraph", () => {
  const graph = buildProgressionGraph(FIXTURE);

  it("builds both directions of every edge", () => {
    expect(graph.unlocks.get("COMS1004W")).toEqual(
      expect.arrayContaining(["COMS3134W", "COMS3137W"]),
    );
    expect(graph.requires.get("COMS3157W")).toEqual(
      expect.arrayContaining(["COMS3134W", "COMS3137W"]),
    );
  });

  it("keeps a course the catalog does not describe as an external node", () => {
    expect(graph.courses.has("MATH1201UN")).toBe(false);
    expect(graph.external.get("MATH1201UN")?.label).toBe("MATH UN1201");
    expect(graph.requires.get("COMS4771W")).toContain("MATH1201UN");
  });

  it("marks an edge under an OR as escapable and a lone edge as required", () => {
    const alternative = graph.edges.find(
      (edge) => edge.from === "COMS3134W" && edge.to === "COMS3157W",
    );
    const required = graph.edges.find(
      (edge) => edge.from === "COMS3157W" && edge.to === "COMS4156W",
    );
    expect(alternative?.kind).toBe("alternative");
    expect(required?.kind).toBe("required");
  });

  it("places a course to the right of everything it needs", () => {
    expect(graph.depth.get("COMS1004W")).toBe(0);
    expect(graph.depth.get("COMS3134W")).toBe(1);
    expect(graph.depth.get("COMS3157W")).toBe(2);
    expect(graph.depth.get("COMS4156W")).toBe(3);
  });

  it("does not hang on a prerequisite cycle", () => {
    const cyclic: PrereqCatalog = {
      ...FIXTURE,
      equivalenceGroups: [],
      courses: [
        course("AAAA1000W", "A", 3, { tree: { kind: "course", courseId: "BBBB1000W", label: "B" } }),
        course("BBBB1000W", "B", 3, { tree: { kind: "course", courseId: "AAAA1000W", label: "A" } }),
      ],
    };
    const built = buildProgressionGraph(cyclic);
    expect(built.depth.size).toBe(2);
  });

  it("walks the chain in both directions", () => {
    expect(descendants(graph, "COMS1004W")).toEqual(
      expect.arrayContaining(["COMS3134W", "COMS3157W", "COMS4156W"]),
    );
    expect(ancestors(graph, "COMS4156W")).toEqual(
      expect.arrayContaining(["COMS3157W", "COMS3134W", "COMS1004W"]),
    );
  });

  it("bounds the neighbourhood it draws", () => {
    const near = neighbourhood(graph, "COMS3157W", { upstream: 1, downstream: 1 });
    expect(near.courseIds).toEqual(
      expect.arrayContaining(["COMS3157W", "COMS3134W", "COMS3137W", "COMS4156W"]),
    );
    expect(near.courseIds).not.toContain("COMS1004W");
  });
});

describe("evaluate", () => {
  const graph = buildProgressionGraph(FIXTURE);

  it("accepts an equivalent course in place of the one named", () => {
    const result = evaluatePrereqTree(
      { kind: "course", courseId: "COMS3134W", label: "COMS W3134" },
      new Set(["COMS3137W"]),
      graph.equivalence,
    );
    expect(result.status).toBe("met");
  });

  it("reports an unmet OR as one choice, not three separate failures", () => {
    const result = evaluateCourse(graph, "COMS3157W", new Set());
    expect(result.status).toBe("unmet");
    expect(result.outstanding).toHaveLength(1);
    expect(result.outstanding[0].options).toEqual(["COMS3134W", "COMS3137W"]);
  });

  it("never calls an unevaluable prose gate satisfied", () => {
    expect(evaluateCourse(graph, "COMS4995W", new Set()).status).toBe("unknown");
  });

  it("lets unknown win over met inside an AND", () => {
    const result = evaluatePrereqTree(
      {
        kind: "all",
        children: [
          { kind: "course", courseId: "COMS1004W", label: "COMS W1004" },
          { kind: "advisory", text: "Knowledge of Java" },
        ],
      },
      new Set(["COMS1004W"]),
      graph.equivalence,
    );
    expect(result.status).toBe("unknown");
  });

  it("counts only what one more course actually opens, not the whole downstream", () => {
    // 1004 leads eventually to 3157 and 4156, but taking it opens only the two
    // data-structures courses this term.
    const opened = newlyUnlockedBy(graph, "COMS1004W", new Set());
    expect(opened.sort()).toEqual(["COMS3134W", "COMS3137W"]);
    expect(descendants(graph, "COMS1004W").length).toBeGreaterThan(opened.length);
  });
});

export { FIXTURE as TEST_CATALOG };
