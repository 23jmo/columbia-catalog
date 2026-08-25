import { describe, expect, it } from "vitest";

import { parseBulletinCode, toCourseId } from "./code";

describe("parseBulletinCode", () => {
  it("reads the directory / Vergil form with the qualifier after the number", () => {
    expect(toCourseId("COMS4115W")).toBe("COMS4115W");
    expect(parseBulletinCode("COMS4115W")?.qualifier).toBe("W");
    expect(toCourseId("HUMA1121C")).toBe("HUMA1121C");
    expect(toCourseId("PSYC1001X")).toBe("PSYC1001X");
    expect(toCourseId("MATH1201UN")).toBe("MATH1201UN");
  });

  it("still reads the Bulletin form with the qualifier before the number", () => {
    expect(toCourseId("COMS W3157")).toBe("COMS3157W");
    expect(toCourseId("COMSW3157")).toBe("COMS3157W");
    expect(toCourseId("MATH UN1201")).toBe("MATH1201UN");
  });
});
