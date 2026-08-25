import { describe, expect, it } from "vitest";

import { CURRENT_TERM } from "@/lib/constants";

import { hydrateCourses, loadCatalog } from "./pipeline";

/**
 * Ranking must not pull section payloads. Hydration is the only place
 * meetings attach, and only for the ids the caller named.
 */
describe("loadCatalog", () => {
  it("returns listings without sections", async () => {
    const catalog = await loadCatalog([CURRENT_TERM]);
    expect(catalog.listings.length).toBeGreaterThan(0);
    expect(catalog.candidates.length).toBe(catalog.listings.length);
    expect(catalog.listings[0]).not.toHaveProperty("sections");
    expect(catalog.listings[0]?.requirementFlags).toEqual({});
    expect(catalog.candidates[0]?.courseId).toBe(catalog.listings[0]?.courseId);
    expect(catalog.candidates[0]?.title).toBe(catalog.listings[0]?.title);
  });
});

describe("hydrateCourses", () => {
  it("returns nothing for an empty shortlist", async () => {
    const hydrated = await hydrateCourses([], [CURRENT_TERM]);
    expect(hydrated.size).toBe(0);
  });

  it("attaches sections only for the ids asked for", async () => {
    const catalog = await loadCatalog([CURRENT_TERM]);
    const ids = catalog.listings.slice(0, 3).map((row) => row.courseId);
    const hydrated = await hydrateCourses(ids, [CURRENT_TERM]);
    expect(hydrated.size).toBe(ids.length);
    for (const id of ids) {
      const course = hydrated.get(id);
      expect(course).toBeDefined();
      expect(course!.sections.length).toBeGreaterThan(0);
    }
  });
});
