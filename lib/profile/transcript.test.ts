import { describe, expect, it } from "vitest";

import { defaultSelection, parseTranscriptText } from "./transcript";

describe("parseTranscriptText", () => {
  it("reads Student Planning rows, including Barnard X and a trailing I in the title", () => {
    const parse = parseTranscriptText(`
Fall 2024
COMS W3157 ADVANCED PROGRAMMING (001) 4 A- Taken
Spring 2025
CSOR W4231 ANALYSIS OF ALGORITHMS I (001) 3 A Taken
COMS W4118 OPERATING SYSTEMS I: OPERATING SYSTEMS I (001) 3 A- Taken
PSYC X1001 INTRODUCTION TO PSYCHOLOG (002) 3 A Taken
ASCE V1360 INTRO-E ASIAN CIV:CHINA-D (001) - - Taken
Fall 2026
COMS W4115 PROGRAMMING LANG & TRANSL (001) 3 Planned
`);
    const byId = Object.fromEntries(parse.candidates.map((row) => [row.courseId, row]));
    expect(byId.COMS3157W.grade).toBe("A-");
    expect(byId.CSOR4231W.grade).toBe("A");
    expect(byId.CSOR4231W.warnings).toEqual([]);
    expect(byId.COMS4118W.grade).toBe("A-");
    expect(byId.PSYC1001X.courseId).toBe("PSYC1001X");
    expect(byId.ASCE1360V.grade).toBeNull();
    expect(byId.ASCE1360V.warnings).toContain("in_progress");
    expect(byId.COMS4115W.warnings).toContain("in_progress");
    expect(defaultSelection(parse.candidates).has("CSOR4231W")).toBe(true);
  });

  it("drops the dotted rule a scan turns into tildes", () => {
    /*
     * Real tesseract output for a Georgia-set transcript, verbatim: the leader
     * dots between the title and the credits column come back as `~~`. It only
     * shows on the review screen — the catalog title wins once the code
     * resolves — but a student reading "ADVANCED PROGRAMMING ~~" next to their
     * own transcript has no way to know that is our noise and not our reading.
     */
    const parse = parseTranscriptText(`
Fall 2024
COMS W3134 DATA STRUCTURES IN JAVA ~~ 3.00 A
COMS W3157 ADVANCED PROGRAMMING -- 4.00 A
`);
    expect(parse.candidates.map((row) => row.title)).toEqual([
      "DATA STRUCTURES IN JAVA",
      "ADVANCED PROGRAMMING",
    ]);
  });

  it("reads directory-shaped codes from a Vergil unofficial record", () => {
    const parse = parseTranscriptText(`
Fall 2024
11932  COMS3134W  001  DATA STRUCTURES IN JAVA  3.00  4.00  Standard A
11934  COMS3157W  001  ADVANCED PROGRAMMING  4.00  3.67  Standard A-
14551  IEOR3658E  001  PROBABILITY FOR ENGINEERS  3.00  4.00  Standard A
`);
    expect(parse.candidates.map((row) => row.courseId).sort()).toEqual([
      "COMS3134W",
      "COMS3157W",
      "IEOR3658E",
    ]);
  });
});
