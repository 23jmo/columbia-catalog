import { describe, expect, it } from "vitest";

import {
  DEFAULT_QUALIFIER_PREFERENCE,
  isRetiredQualifier,
  parseBulletinCode,
  qualifierPreference,
} from "@/lib/requirements/code";

/**
 * The registrar's retired school letters, and the rule that keeps a live course
 * from being rewritten into a different one.
 *
 * Every expectation here is pinned to the live catalog census taken on
 * 2026-08-27: `V`, `X`, `C` and `F` have zero rows; `W` (72), `E` (740) and
 * `G` (119) are still issued and must never be aliased.
 */
describe("retired school letters", () => {
  it("treats only the genuinely retired letters as renumbering candidates", () => {
    for (const retired of ["C", "V", "X", "F"]) {
      expect(isRetiredQualifier(retired)).toBe(true);
    }
    // Still live in the catalog — aliasing these would rewrite real courses.
    for (const live of ["W", "E", "G", "UN", "BC", "CC", "GU", "GR"]) {
      expect(isRetiredQualifier(live)).toBe(false);
    }
    expect(isRetiredQualifier(null)).toBe(false);
  });

  it("sends X to Barnard, because X IS Barnard", () => {
    // PSYC X1001 and PSYC UN1001 are different courses at different colleges.
    // Preferring UN here would silently swap one for the other.
    expect(qualifierPreference("X")[0]).toBe("BC");
  });

  it("sends C to Columbia College before the generic undergraduate code", () => {
    // ENGL C1010 (University Writing) exists as both ENGL CC1010 and ENGL GS1010.
    const order = qualifierPreference("C");
    expect(order.indexOf("CC")).toBeLessThan(order.indexOf("GS"));
    expect(order[0]).toBe("CC");
  });

  it("sends V — an interschool course with Barnard — to the Columbia listing", () => {
    // MATH V2010 is Linear Algebra, filed today as MATH UN2010.
    expect(qualifierPreference("V")[0]).toBe("UN");
  });

  it("still ranks every modern qualifier for a letter it has no rule for", () => {
    const order = qualifierPreference("Q");
    expect(order).toEqual([...DEFAULT_QUALIFIER_PREFERENCE]);
  });

  it("never drops a modern qualifier from a legacy letter's order", () => {
    for (const legacy of ["C", "V", "X", "F"]) {
      const order = qualifierPreference(legacy);
      for (const modern of DEFAULT_QUALIFIER_PREFERENCE) {
        expect(order).toContain(modern);
      }
      expect(new Set(order).size).toBe(order.length);
    }
  });
});

describe("the codes this was built for", () => {
  const cases: { typed: string; subject: string; number: number; legacy: string }[] = [
    { typed: "ENGL C1010", subject: "ENGL", number: 1010, legacy: "C" },
    { typed: "HUMA C1121", subject: "HUMA", number: 1121, legacy: "C" },
    { typed: "MATH V2010", subject: "MATH", number: 2010, legacy: "V" },
    { typed: "ASCE V1359", subject: "ASCE", number: 1359, legacy: "V" },
    { typed: "PSYC X1001", subject: "PSYC", number: 1001, legacy: "X" },
    { typed: "COMS X1016", subject: "COMS", number: 1016, legacy: "X" },
  ];

  it.each(cases)("parses $typed and marks it renumberable", ({ typed, subject, number, legacy }) => {
    const parsed = parseBulletinCode(typed);
    expect(parsed).not.toBeNull();
    expect(parsed!.subjectCode.trim()).toBe(subject);
    expect(parsed!.number).toBe(number);
    expect(parsed!.qualifier).toBe(legacy);
    expect(isRetiredQualifier(parsed!.qualifier)).toBe(true);
  });

  it("leaves COMS W4901 alone — it is in the catalog under exactly this id", () => {
    const parsed = parseBulletinCode("COMS W4901");
    expect(parsed!.courseId).toBe("COMS4901W");
    expect(isRetiredQualifier(parsed!.qualifier)).toBe(false);
  });
});
