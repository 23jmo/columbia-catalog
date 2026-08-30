import { describe, expect, it } from "vitest";

import { formatRule, ruleKindLabel } from "./format-rule";
import { listPublicPrograms, programPageTitle } from "./public-programs";

describe("listPublicPrograms", () => {
  it("ships CC and SEAS cores and majors, and nothing else", () => {
    const programs = listPublicPrograms();
    const ids = programs.map((program) => program.id);

    expect(ids).toContain("cc-core");
    expect(ids).toContain("seas-core");
    expect(ids).toContain("cc-major-computer-science");
    expect(ids).toContain("seas-major-computer-science");

    expect(ids).not.toContain("cc-minor-computer-science");
    expect(ids).not.toContain("cc-concentration-economics");
    expect(programs.every((program) => program.origin === "authored")).toBe(true);
    expect(programs.every((program) => program.school === "CC" || program.school === "SEAS")).toBe(
      true,
    );
    expect(programs.every((program) => program.kind === "core" || program.kind === "major")).toBe(
      true,
    );
  });

  it("keeps College CS and SEAS CS as two pages", () => {
    const cc = listPublicPrograms().find((program) => program.id === "cc-major-computer-science");
    const seas = listPublicPrograms().find((program) => program.id === "seas-major-computer-science");
    expect(cc).toBeDefined();
    expect(seas).toBeDefined();
    expect(programPageTitle(cc!)).toBe(
      "Computer Science at Columbia College: what LionPlan checks",
    );
    expect(programPageTitle(seas!)).toBe(
      "Computer Science at Columbia Engineering: what LionPlan checks",
    );
    const ccCalc = cc!.groups.find((group) => group.id === "calculus");
    const seasCalc = seas!.groups.find((group) => group.id === "calculus");
    expect(ccCalc?.rule.kind).toBe("n_of");
    expect(seasCalc?.rule.kind).toBe("all_of");
  });
});

describe("formatRule", () => {
  it("reads each rule kind in English, not as TypeScript", () => {
    expect(formatRule({ kind: "all_of", courses: ["HUMA CC1001", "HUMA CC1002"] })).toBe(
      "All of these: HUMA CC1001, HUMA CC1002.",
    );
    expect(
      formatRule({ kind: "n_of", n: 1, courses: ["COMS W1004", "COMS W1007"] }),
    ).toBe("Choose 1 of: COMS W1004, COMS W1007.");
    expect(
      formatRule({
        kind: "sequence_choice",
        sequences: [
          { label: "Lit Hum", courses: ["HUMA CC1001", "HUMA CC1002"] },
          { label: "CC", courses: ["COCI CC1101", "COCI CC1102"] },
        ],
      }),
    ).toContain("One sequence:");
    expect(
      formatRule({ kind: "n_matching", n: 2, select: { flag: "globalCore" } }),
    ).toBe("2 courses matching on the Global Core list.");
    expect(
      formatRule({
        kind: "points_matching",
        points: 12,
        select: { subjects: ["COMS"], numberRange: [3000, 4999] },
      }),
    ).toBe("12 points matching COMS courses, numbered 3000 to 4999.");
    expect(formatRule({ kind: "attested", note: "Swimming test." })).toBe(
      "You confirm this yourself. Swimming test.",
    );
    expect(ruleKindLabel("sequence_choice")).toBe("One sequence");
  });
});
