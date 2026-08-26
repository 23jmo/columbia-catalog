import { describe, expect, it } from "vitest";

import { courseChipLines } from "./chip";

describe("courseChipLines", () => {
  it("leads with the title and puts the call number underneath", () => {
    expect(courseChipLines("ENGL CC1010", "UNIVERSITY WRITING")).toEqual({
      label: "University Writing",
      sublabel: "ENGL CC1010",
    });
  });

  it("falls back to the code alone when there is no title and no known name", () => {
    expect(courseChipLines("HIST UN1002", null)).toEqual({ label: "HIST UN1002" });
    expect(courseChipLines("HIST UN1002", "   ")).toEqual({ label: "HIST UN1002" });
  });

  it("fills a known core title when the catalog row is missing", () => {
    expect(courseChipLines("ENGL CC1010", null)).toEqual({
      label: "University Writing",
      sublabel: "ENGL CC1010",
    });
    expect(courseChipLines("ECON UN1105", "")).toEqual({
      label: "Principles of Economics",
      sublabel: "ECON UN1105",
    });
  });
});
