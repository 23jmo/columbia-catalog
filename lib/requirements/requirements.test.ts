import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  formatCourseId,
  levelOf,
  padSubjectCode,
  parseBulletinCode,
  splitCodeSequence,
  toCourseId,
} from "./code";
import { crossCountedCourseIds, evaluateProgram, type CourseFacts } from "./evaluate";
import { AUTHORED_PROGRAMS, CC_CORE, CC_MAJOR_COMPUTER_SCIENCE, SEAS_CORE } from "./programs";
import { verificationOf } from "./types";
import { parseRequirementTables } from "../ingest/parsers/requirements";

// ---------------------------------------------------------------------------
// Course codes
// ---------------------------------------------------------------------------

describe("bulletin code parsing", () => {
  it("reads the canonical spaced form", () => {
    expect(toCourseId("MATH UN1201")).toBe("MATH1201UN");
    expect(toCourseId("COMS W3157")).toBe("COMS3157W");
    expect(toCourseId("HUMA CC1001")).toBe("HUMA1001CC");
    expect(toCourseId("CSEE W3827")).toBe("CSEE3827W");
  });

  it("pads short subject codes the way the directory does", () => {
    // Migration 0012: `/subj/PE__/`, `/subj/LAW_/`. A comparison that skips
    // this loses whole subjects.
    expect(padSubjectCode("PE")).toBe("PE__");
    expect(padSubjectCode("LAW")).toBe("LAW_");
    expect(padSubjectCode("COMS")).toBe("COMS");
    expect(padSubjectCode("IEORE")).toBe("IEORE");
  });

  it("splits an unspaced code on the qualifier, not on greed", () => {
    // The regression this list exists for: a greedy regex reads MATHUN1201 as
    // subject MATHU + qualifier N, a course that has never existed.
    expect(toCourseId("MATHUN1201")).toBe("MATH1201UN");
    expect(toCourseId("COMSW3157")).toBe("COMS3157W");
    expect(toCourseId("APMAE2000")).toBe("APMA2000E");
  });

  it("does not invent a qualifier on a genuinely unqualified code", () => {
    // ECON ends in N. Stripping it yields "ECO N3213", equally nonexistent.
    const parsed = parseBulletinCode("ECON3213");
    expect(parsed?.subjectCode).toBe("ECON");
    expect(parsed?.qualifier).toBeNull();
  });

  it("returns null for prose rather than guessing", () => {
    expect(toCourseId("All economics core courses")).toBeNull();
    expect(toCourseId("Select one of the following courses:")).toBeNull();
    expect(toCourseId("")).toBeNull();
  });

  it("splits the ampersand sequence form into its courses", () => {
    expect(splitCodeSequence("HUMA CC1001&amp; HUMA CC1002")).toEqual([
      "HUMA CC1001",
      "HUMA CC1002",
    ]);
    expect(
      splitCodeSequence("MATH UN1101&amp; MATH UN1102&amp; MATH UN1201"),
    ).toHaveLength(3);
  });

  it("round-trips a course id back to the spelling a student reads", () => {
    expect(formatCourseId("MATH1201UN")).toBe("MATH UN1201");
    expect(formatCourseId("PHED1001UN")).toBe("PHED UN1001");
    expect(formatCourseId("PE__1001UN")).toBe("PE UN1001");
  });

  it("reads the level band", () => {
    expect(levelOf("COMS4118W")).toBe(4000);
    expect(levelOf("COMS1004W")).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// A small catalog to evaluate against
// ---------------------------------------------------------------------------

function facts(
  code: string,
  points: number,
  flags: Record<string, boolean> = {},
): [string, CourseFacts] {
  const courseId = toCourseId(code)!;
  return [
    courseId,
    { courseId, title: code, points, requirementFlags: flags },
  ];
}

const CATALOG = new Map<string, CourseFacts>([
  facts("HUMA CC1001", 4),
  facts("HUMA CC1002", 4),
  facts("SCNC CC1000", 3),
  facts("ENGL CC1010", 3),
  facts("COCI CC1101", 4),
  facts("COCI CC1102", 4),
  facts("HUMA UN1121", 3),
  facts("HUMA UN1123", 3),
  facts("ASTR UN1403", 3, { scienceRequirement: true }),
  facts("EESC UN2100", 3, { scienceRequirement: true }),
  facts("ASCE UN1359", 3, { globalCore: true }),
  facts("ASCE UN1361", 3, { globalCore: true }),
  facts("PHED UN1001", 1),
  facts("PHED UN1012", 1),
  facts("MATH UN1201", 3),
  facts("MATH UN2015", 4),
  facts("COMS W1004", 3),
  facts("COMS W3134", 3),
  facts("COMS W3137", 4),
  facts("COMS W3157", 4),
  facts("COMS W3203", 3),
  facts("COMS W3261", 3),
  facts("CSEE W3827", 3),
  facts("COMS W4118", 3),
  facts("COMS W4111", 3),
  facts("COMS W4701", 3),
  facts("COMS W3902", 3),
  facts("COMS W4995", 3),
  facts("ECON UN1105", 4),
]);

const lookup = (courseId: string) => CATALOG.get(courseId);

function taken(codes: string[], planned = false) {
  return codes.map((code) => ({
    courseId: toCourseId(code)!,
    termCode: "20253",
    planned,
  }));
}

// ---------------------------------------------------------------------------
// The audit engine
// ---------------------------------------------------------------------------

describe("evaluateProgram", () => {
  it("marks an all_of group satisfied only when every course is present", () => {
    const half = evaluateProgram(CC_CORE, {
      taken: taken(["HUMA CC1001"]),
      lookup,
    });
    const litHum = half.groups.find((g) => g.group.id === "lit-hum")!;
    expect(litHum.status).toBe("in_progress");
    expect(litHum.completed).toBe(1);
    expect(litHum.required).toBe(2);
    // The half they still owe is named, so the card can offer it.
    expect(litHum.candidates).toEqual(["HUMA1002CC"]);

    const whole = evaluateProgram(CC_CORE, {
      taken: taken(["HUMA CC1001", "HUMA CC1002"]),
      lookup,
    });
    expect(whole.groups.find((g) => g.group.id === "lit-hum")!.status).toBe("satisfied");
  });

  it("counts flagged requirements against the registrar's own flags", () => {
    const result = evaluateProgram(CC_CORE, {
      taken: taken(["ASCE UN1359", "ASCE UN1361"]),
      lookup,
    });
    const globalCore = result.groups.find((g) => g.group.id === "global-core")!;
    expect(globalCore.status).toBe("satisfied");
    expect(globalCore.verification).toBe("flagged");
  });

  it("refuses to credit a flagged requirement for a course it has never seen", () => {
    // A transcript paste can name a course that is not in our catalog. We
    // cannot prove it carries the Global Core flag, so it must not count —
    // this is the false-green the whole verification-tier design exists to stop.
    const result = evaluateProgram(CC_CORE, {
      taken: taken(["ANTH UN3040", "ANTH UN3041"]),
      lookup,
    });
    expect(result.groups.find((g) => g.group.id === "global-core")!.status).toBe("unmet");
  });

  it("only satisfies an attested group when the student has ticked it", () => {
    const untouched = evaluateProgram(CC_CORE, { taken: [], lookup });
    const language = untouched.groups.find((g) => g.group.id === "foreign-language")!;
    expect(language.status).toBe("unmet");
    expect(language.verification).toBe("attested");

    const attested = evaluateProgram(CC_CORE, {
      taken: [],
      lookup,
      attestations: { "foreign-language": "2026-08-23T00:00:00.000Z" },
    });
    expect(attested.groups.find((g) => g.group.id === "foreign-language")!.status).toBe(
      "satisfied",
    );
  });

  it("requires a whole sequence, never a mix of two", () => {
    // The bug `sequence_choice` exists to prevent: Lit Hum I + CC I is two
    // courses and satisfies neither sequence.
    const mixed = evaluateProgram(SEAS_CORE, {
      taken: taken(["HUMA CC1001", "COCI CC1101"]),
      lookup,
    });
    const sequence = mixed.groups.find((g) => g.group.id === "core-sequence")!;
    expect(sequence.status).toBe("in_progress");
    expect(sequence.completed).toBe(1);

    const whole = evaluateProgram(SEAS_CORE, {
      taken: taken(["COCI CC1101", "COCI CC1102"]),
      lookup,
    });
    expect(whole.groups.find((g) => g.group.id === "core-sequence")!.status).toBe(
      "satisfied",
    );
  });

  it("counts points rather than courses where the Bulletin does", () => {
    const result = evaluateProgram(CC_MAJOR_COMPUTER_SCIENCE, {
      taken: taken(["COMS W3902", "COMS W4995"]),
      lookup,
    });
    const electives = result.groups.find((g) => g.group.id === "electives")!;
    expect(electives.unit).toBe("points");
    expect(electives.completed).toBe(6);
    expect(electives.required).toBe(9);
    expect(electives.status).toBe("in_progress");
  });

  it("never reports more than the requirement asks for", () => {
    const result = evaluateProgram(CC_CORE, {
      taken: taken(["PHED UN1001", "PHED UN1012", "ASTR UN1403", "EESC UN2100"]),
      lookup,
    });
    const pe = result.groups.find((g) => g.group.id === "physical-education")!;
    expect(pe.completed).toBe(2);
    expect(pe.matched).toHaveLength(2);
  });

  it("counts planned courses but marks every one of them", () => {
    const result = evaluateProgram(CC_CORE, {
      taken: [...taken(["HUMA CC1001"]), ...taken(["HUMA CC1002"], true)],
      lookup,
    });
    const litHum = result.groups.find((g) => g.group.id === "lit-hum")!;
    expect(litHum.status).toBe("satisfied");
    expect(litHum.matched.filter((m) => m.planned)).toHaveLength(1);
  });

  it("reports a course doing double duty instead of assigning it", () => {
    // MATH UN2015 is the one place the CS department publishes an explicit
    // double-count permission, so it is the canonical case.
    const result = evaluateProgram(CC_MAJOR_COMPUTER_SCIENCE, {
      taken: taken(["MATH UN2015"]),
      lookup,
    });
    expect(result.groups.find((g) => g.group.id === "linear-algebra")!.status).toBe(
      "satisfied",
    );
    expect(
      result.groups.find((g) => g.group.id === "probability-statistics")!.status,
    ).toBe("satisfied");
    expect(crossCountedCourseIds([result])).toContain("MATH2015UN");
  });

  it("weights progress by what each group asks for", () => {
    const empty = evaluateProgram(CC_CORE, { taken: [], lookup });
    expect(empty.fraction).toBe(0);

    const some = evaluateProgram(CC_CORE, {
      taken: taken(["HUMA CC1001", "HUMA CC1002", "SCNC CC1000", "ENGL CC1010"]),
      lookup,
    });
    expect(some.fraction).toBeGreaterThan(0);
    expect(some.fraction).toBeLessThan(1);
    expect(some.satisfiedCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Program hygiene — cheap invariants that catch a bad transcription
// ---------------------------------------------------------------------------

describe("authored programs", () => {
  it("every group id is unique within its program", () => {
    for (const program of AUTHORED_PROGRAMS) {
      const ids = program.groups.map((g) => g.id);
      expect(new Set(ids).size, `${program.id} has duplicate group ids`).toBe(ids.length);
    }
  });

  it("every course code in every rule actually parses", () => {
    for (const program of AUTHORED_PROGRAMS) {
      for (const group of program.groups) {
        const codes: string[] = [];
        const rule = group.rule;
        if (rule.kind === "all_of" || rule.kind === "n_of") codes.push(...rule.courses);
        if (rule.kind === "sequence_choice") {
          for (const sequence of rule.sequences) codes.push(...sequence.courses);
        }
        if (rule.kind === "n_matching" || rule.kind === "points_matching") {
          codes.push(...(rule.select.include ?? []), ...(rule.select.exclude ?? []));
        }
        for (const code of codes) {
          expect(toCourseId(code), `${program.id}/${group.id}: "${code}"`).not.toBeNull();
        }
      }
    }
  });

  it("never claims a stronger verification tier than its rule supports", () => {
    for (const program of AUTHORED_PROGRAMS) {
      for (const group of program.groups) {
        const tier = verificationOf(group.rule);
        if (group.rule.kind === "attested") expect(tier).toBe("attested");
        if (group.rule.kind === "n_matching") expect(tier).toBe("flagged");
        if (group.rule.kind === "all_of") expect(tier).toBe("exact");
      }
    }
  });

  it("an n_of rule never asks for more courses than it lists", () => {
    for (const program of AUTHORED_PROGRAMS) {
      for (const group of program.groups) {
        if (group.rule.kind !== "n_of") continue;
        expect(
          group.rule.courses.length,
          `${program.id}/${group.id} asks for ${group.rule.n} of ${group.rule.courses.length}`,
        ).toBeGreaterThanOrEqual(group.rule.n);
      }
    }
  });

  it("carries a source link on every group, so a student can check us", () => {
    for (const program of AUTHORED_PROGRAMS) {
      for (const group of program.groups) {
        expect(group.sourceUrl, `${program.id}/${group.id}`).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The parser, checked against the hand-authored program
// ---------------------------------------------------------------------------

const FIXTURE = readFileSync(
  join(__dirname, "../ingest/__fixtures__/bulletin-cs.html"),
  "utf8",
);

describe("parseRequirementTables against the CS fixture", () => {
  const parsed = parseRequirementTables(FIXTURE, {
    section: "Major in Computer Science",
    stopAt: ["Major in Computational Biology"],
  });

  it("finds the requirement groups the department publishes", () => {
    expect(parsed.groups.length).toBeGreaterThanOrEqual(4);
  });

  it("splits one heading's three tables into three separate groups", () => {
    // The trap: "Mathematics Requirement" owns Calculus, Linear Algebra and
    // Probability tables. Collapsing them lets three calculus courses satisfy
    // all of mathematics.
    const labels = parsed.groups.map((g) => g.label.toLowerCase());
    expect(labels.some((l) => l.includes("calculus"))).toBe(true);
    expect(labels.some((l) => l.includes("linear algebra"))).toBe(true);
    expect(labels.some((l) => l.includes("probability"))).toBe(true);
  });

  it("reads 'Select one of the following' as a choice, not as a list of requirements", () => {
    const calculus = parsed.groups.find((g) => g.label.toLowerCase().includes("calculus"));
    expect(calculus?.rule.kind).toBe("n_of");
    if (calculus?.rule.kind === "n_of") {
      expect(calculus.rule.n).toBe(1);
      expect(calculus.rule.courses.map(toCourseId)).toContain("MATH1201UN");
      expect(calculus.rule.courses.map(toCourseId)).toContain("APMA2000E");
    }
  });

  it("agrees with the hand-authored calculus group", () => {
    // The validation the whole two-track approach exists for: the parser's
    // output for a group a human also transcribed must name the same courses.
    const authored = CC_MAJOR_COMPUTER_SCIENCE.groups.find((g) => g.id === "calculus")!;
    const parsedCalculus = parsed.groups.find((g) =>
      g.label.toLowerCase().includes("calculus"),
    )!;

    const authoredIds =
      authored.rule.kind === "n_of" ? authored.rule.courses.map(toCourseId).sort() : [];
    const parsedIds =
      parsedCalculus.rule.kind === "n_of"
        ? parsedCalculus.rule.courses.map(toCourseId).sort()
        : [];

    expect(parsedIds).toEqual(authoredIds);
  });

  it("treats an 'or' row as an alternative rather than a second requirement", () => {
    // "COMS W1004 / or COMS W1007" is one slot with two satisfactions. Read as
    // two requirements, every CS student is permanently one course short.
    const withOr = parsed.groups.find((group) => {
      if (group.rule.kind !== "n_of") return false;
      const ids = group.rule.courses.map(toCourseId);
      return ids.includes("COMS1004W") && ids.includes("COMS1007W");
    });
    expect(withOr, "the W1004/W1007 alternative should be one n_of group").toBeTruthy();
    if (withOr?.rule.kind === "n_of") expect(withOr.rule.n).toBe(1);
  });

  it("does not emit an attested rule — that judgement is a human's", () => {
    for (const group of parsed.groups) {
      expect(group.rule.kind).not.toBe("attested");
    }
  });
});

describe("parseRequirementTables on a pointer-only table", () => {
  it("reports rows that name no courses instead of emitting an impossible group", () => {
    // The Economics shape: every row is prose pointing elsewhere. A group with
    // zero courses can never be satisfied and must not reach a student.
    const html = `
      <h3>Major in Economics</h3>
      <table class="sc_courselist"><tbody>
        <tr class="areaheader"><td colspan="2"><span class="courselistcomment areaheader">Economics Core Courses</span></td></tr>
        <tr><td colspan="2"><span class="courselistcomment">All economics core courses</span></td></tr>
        <tr class="areaheader"><td colspan="2"><span class="courselistcomment areaheader">Mathematics</span></td></tr>
        <tr><td colspan="2"><span class="courselistcomment">Select a mathematics sequence</span></td></tr>
      </tbody></table>`;

    const result = parseRequirementTables(html);
    expect(result.groups).toHaveLength(0);
    expect(result.unresolved.length).toBeGreaterThan(0);
    expect(result.unresolved.map((u) => u.label)).toContain("Economics Core Courses");
  });
});
