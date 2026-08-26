import { describe, expect, it } from "vitest";

import { courseChipLines } from "./chip";

describe("courseChipLines", () => {
  it("leads with the title and puts the call number underneath", () => {
    expect(courseChipLines("ENGL CC1010", "UNIVERSITY WRITING")).toEqual({
      label: "University Writing",
      sublabel: "ENGL CC1010",
    });
  });

  it("falls back to the code alone when there is no title", () => {
    expect(courseChipLines("COMS W1004", null)).toEqual({ label: "COMS W1004" });
    expect(courseChipLines("COMS W1004", "   ")).toEqual({ label: "COMS W1004" });
  });
});
