import { describe, expect, it } from "vitest";

import { admitsSchool, gateCatalogForSchool } from "./school-gate";

describe("admitsSchool", () => {
  const apma2000 = { courseId: "APMA2000E", qualifier: "E" };

  it("keeps the SEAS first-year sequence for SEAS students only", () => {
    expect(admitsSchool(apma2000, "SEAS")).toBe(true);
    expect(admitsSchool(apma2000, "CC")).toBe(false);
    expect(admitsSchool(apma2000, "GS")).toBe(false);
    expect(admitsSchool(apma2000, "BC")).toBe(false);
  });

  it("leaves every other engineering course open to everyone", () => {
    // Half of Columbia College takes these for the science requirement.
    expect(admitsSchool({ courseId: "EAEE2100E", qualifier: "E" }, "CC")).toBe(true);
    expect(admitsSchool({ courseId: "ELEN1101E", qualifier: "E" }, "GS")).toBe(true);
    expect(admitsSchool({ courseId: "APMA3101E", qualifier: "E" }, "BC")).toBe(true);
  });

  it("keeps each school's own Core sections to that school", () => {
    expect(admitsSchool({ courseId: "HUMA1001CC", qualifier: "CC" }, "CC")).toBe(true);
    expect(admitsSchool({ courseId: "HUMA1001CC", qualifier: "CC" }, "SEAS")).toBe(false);
    expect(admitsSchool({ courseId: "HUMA1001GS", qualifier: "GS" }, "GS")).toBe(true);
    expect(admitsSchool({ courseId: "HUMA1001GS", qualifier: "GS" }, "CC")).toBe(false);
  });

  it("admits UN, BC and graduate designators for every school", () => {
    for (const school of ["CC", "SEAS", "GS", "BC"] as const) {
      expect(admitsSchool({ courseId: "MATH1201UN", qualifier: "UN" }, school)).toBe(true);
      expect(admitsSchool({ courseId: "SPAN3435BC", qualifier: "BC" }, school)).toBe(true);
      expect(admitsSchool({ courseId: "SPAN4010GU", qualifier: "GU" }, school)).toBe(true);
      expect(admitsSchool({ courseId: "X1000", qualifier: null }, school)).toBe(true);
    }
  });

  it("gates nothing when the school is unknown", () => {
    expect(admitsSchool(apma2000, null)).toBe(true);
    expect(admitsSchool({ courseId: "HUMA1001CC", qualifier: "CC" }, null)).toBe(true);
  });
});

describe("gateCatalogForSchool", () => {
  const listing = (courseId: string, qualifier: string, number: number) => ({
    courseId,
    subjectCode: courseId.slice(0, 4),
    number,
    qualifier,
    title: courseId,
    pointsMin: 3,
    pointsMax: 3,
    requirementFlags: {},
  });
  const catalog = {
    listings: [listing("APMA2000E", "E", 2000), listing("MATH1201UN", "UN", 1201)],
    candidates: [
      { courseId: "APMA2000E", code: "APMA 2000E", title: "x", points: 3 },
      { courseId: "MATH1201UN", code: "MATH 1201UN", title: "y", points: 3 },
    ],
  };

  it("removes the course from listings and candidates together", () => {
    const gated = gateCatalogForSchool(catalog, "CC");
    expect(gated.listings.map((l) => l.courseId)).toEqual(["MATH1201UN"]);
    expect(gated.candidates.map((c) => c.courseId)).toEqual(["MATH1201UN"]);
  });

  it("returns the catalog untouched for an unknown school", () => {
    expect(gateCatalogForSchool(catalog, null)).toBe(catalog);
  });
});
