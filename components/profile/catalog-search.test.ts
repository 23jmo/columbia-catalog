import { describe, expect, it } from "vitest";

import { unmatchedFromQuery } from "./catalog-search";

describe("unmatchedFromQuery", () => {
  const blocked = new Set<string>();

  it("offers a typed Bulletin code the catalog did not return", () => {
    const unmatched = unmatchedFromQuery("MATH UN1201", [], blocked);
    expect(unmatched).toEqual({ courseId: "MATH1201UN", code: "MATH UN1201" });
  });

  it("does not offer a title search as a raw code", () => {
    expect(unmatchedFromQuery("organic chemistry", [], blocked)).toBeNull();
  });

  it("does not offer a code already in the hit list", () => {
    expect(
      unmatchedFromQuery("MATH UN1201", [{ courseId: "MATH1201UN" }], blocked),
    ).toBeNull();
  });

  it("does not offer a course already on the record", () => {
    expect(
      unmatchedFromQuery("COMS W3134", [], new Set(["COMS3134W"])),
    ).toBeNull();
  });
});
