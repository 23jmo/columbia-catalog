import { describe, expect, it } from "vitest";

import { coverCompositionForTests } from "./cover";

describe("ProfileCover composition", () => {
  it("is deterministic for the same seed", () => {
    const a = coverCompositionForTests("Martha A Kim");
    const b = coverCompositionForTests("Martha A Kim");
    expect(a).toEqual(b);
  });

  it("varies streak angle across seeds", () => {
    const kim = coverCompositionForTests("Martha A Kim");
    const cs = coverCompositionForTests("CSEE 3827");
    expect(kim.streakRotate).not.toBe(cs.streakRotate);
  });
});
