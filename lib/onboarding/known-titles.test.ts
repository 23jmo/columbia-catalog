import { describe, expect, it } from "vitest";

import { knownCatalogFact, titleForCourseId } from "./known-titles";

describe("titleForCourseId", () => {
  it("resolves a directory id and a bulletin code to the same title", () => {
    expect(titleForCourseId("ENGL1010CC")).toBe("University Writing");
    expect(titleForCourseId("ENGL CC1010")).toBe("University Writing");
  });

  it("returns null for a course we have not named", () => {
    expect(titleForCourseId("HIST1002UN")).toBeNull();
  });

  it("names the SEAS computing intro that the seed catalog omits", () => {
    expect(titleForCourseId("ENGI E1006")).toBe(
      "Introduction to Computing for Engineers and Applied Scientists",
    );
    expect(titleForCourseId("COMS W1007")).toBe("Honors Introduction to Computer Science");
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
