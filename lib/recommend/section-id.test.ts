import { describe, expect, it } from "vitest";

import { courseIdFromSectionId, courseIdsFromSectionIds } from "./section-id";

describe("courseIdFromSectionId", () => {
  it("peels the term and the section code off a directory id", () => {
    expect(courseIdFromSectionId("20263COMS4113W001")).toBe("COMS4113W");
  });

  it("keeps a padded PE subject and a two-letter qualifier", () => {
    expect(courseIdFromSectionId("20261PE__1001UN001")).toBe("PE__1001UN");
  });

  it("keeps a five-letter subject", () => {
    expect(courseIdFromSectionId("20263CSEE4119W001")).toBe("CSEE4119W");
  });

  it("returns null for junk rather than inventing a course", () => {
    expect(courseIdFromSectionId("")).toBeNull();
    expect(courseIdFromSectionId("COMS4113W")).toBeNull();
    expect(courseIdFromSectionId("20263COMS4113W")).toBeNull();
  });
});

describe("courseIdsFromSectionIds", () => {
  it("dedupes two sections of the same course", () => {
    expect(
      courseIdsFromSectionIds(["20263COMS4111W001", "20263COMS4111W002", "20261HUMA1001CC001"]),
    ).toEqual(new Set(["COMS4111W", "HUMA1001CC"]));
  });
});
