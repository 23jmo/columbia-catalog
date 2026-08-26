import { describe, expect, it } from "vitest";

import { knownCatalogFact, titleForCourseId } from "./known-titles";

describe("titleForCourseId", () => {
  it("resolves a directory id and a bulletin code to the same title", () => {
    expect(titleForCourseId("ENGL1010CC")).toBe("University Writing");
    expect(titleForCourseId("ENGL CC1010")).toBe("University Writing");
  });

  it("returns null for a course we have not named", () => {
    expect(titleForCourseId("COMS1004W")).toBeNull();
  });
});

describe("knownCatalogFact", () => {
  it("pairs the printed code with the display title", () => {
    expect(knownCatalogFact("ENGL1010CC")).toEqual({
      code: "ENGL CC1010",
      title: "University Writing",
      points: null,
    });
  });
});
