import { describe, expect, it } from "vitest";

import { interestTagsForPrograms, programsWithInterestTags } from "./interest-tags";

describe("Medical Humanities interest tags", () => {
  it("offers the fields named by the GS program instead of skipping interests", () => {
    const tags = interestTagsForPrograms(["gs-major-medical-humanities"]);

    expect(programsWithInterestTags()).toContain("gs-major-medical-humanities");
    expect(tags.map((tag) => tag.id)).toEqual([
      "narrative-medicine",
      "end-of-life-care",
      "literature-medicine",
      "health-justice",
      "bioethics",
      "psychoanalysis",
    ]);
    expect(tags.every((tag) => tag.exemplars.length > 0)).toBe(true);
  });
});
