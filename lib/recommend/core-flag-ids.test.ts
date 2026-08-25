import { describe, expect, it } from "vitest";

import { fallbackIdsForFlag, offeredFallbackIds } from "./core-flag-ids";

describe("fallbackIdsForFlag", () => {
  it("loads the captured Global Core list, including the first Fall 2026 row", () => {
    const ids = fallbackIdsForFlag("globalCore");
    expect(ids.size).toBeGreaterThan(300);
    expect(ids.has("AFAS1001UN")).toBe(true);
  });

  it("does not invent a flag the Bulletin pages do not write", () => {
    expect(fallbackIdsForFlag("scienceWithLab").size).toBe(0);
  });
});

describe("offeredFallbackIds", () => {
  it("keeps only ids that are actually on offer this term", () => {
    const hits = offeredFallbackIds("globalCore", ["AFAS1001UN", "COMS4111W"]);
    expect(hits).toEqual(new Set(["AFAS1001UN"]));
  });

  it("folds a qualifier spelling so a Bulletin UN code still matches the catalog", () => {
    // Catalog has the W sibling; Bulletin wrote UN. Same number, one qualifier.
    const hits = offeredFallbackIds("globalCore", ["AFAS1001W"]);
    expect(hits.has("AFAS1001W")).toBe(true);
  });
});
