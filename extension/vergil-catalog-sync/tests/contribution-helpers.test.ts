import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

import { beforeAll, describe, expect, it } from "vitest";

interface ContributionHelpers {
  contributionPayload(state: unknown, exportedAt?: string): null | {
    schemaVersion: 1;
    exportedAt: string;
    source: string;
    scan: { termCode: string };
    sections: Array<{ termCode: string; sectionKey: string }>;
  };
  contributionSummary(state: unknown): {
    ready: boolean;
    reason: string | null;
    termCode: string | null;
    sections: number;
    meetings: number;
    locations: number;
    observedFrom: string | null;
    observedTo: string | null;
  };
}

let helpers: ContributionHelpers;

const observedAt = "2026-08-24T17:05:16.725Z";

function section(termCode: string, callNumber: string) {
  const courseId = termCode === "20263" ? "COMS1004W" : "COMS4113W";
  return {
    sectionKey: `${termCode}${courseId}001`,
    termCode,
    courseId,
    sectionCode: "001",
    callNumber,
    meetings: [
      {
        weekday: "Mo",
        startMinute: 880,
        endMinute: 955,
        buildingName: "HAVEMEYER HALL",
        room: "HAV 309",
      },
    ],
    observedAt,
    provenance: "Vergil course search",
  };
}

function completeState() {
  return {
    scan: {
      status: "complete",
      termCode: "20263",
      page: 52,
      pages: 52,
      scannedCourses: 5194,
      totalCourses: 5194,
      startedAt: "2026-08-24T17:01:05.161Z",
      completedAt: "2026-08-24T17:05:18.170Z",
      error: null,
      baselineSectionCount: 9932,
      sectionsCaptured: 1,
    },
    sections: {
      "20263COMS1004W001": section("20263", "13512"),
      "20261COMS4113W001": section("20261", "19581"),
    },
  };
}

beforeAll(async () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  for (const file of ["capture-schema.js", "contribution-helpers.js"]) {
    const source = await readFile(path.resolve(testDirectory, `../${file}`), "utf8");
    runInThisContext(source, { filename: file });
  }
  helpers = (
    globalThis as typeof globalThis & {
      ColumbiaCatalogContributionHelpers: ContributionHelpers;
    }
  ).ColumbiaCatalogContributionHelpers;
});

describe("full-scan contribution handoff", () => {
  it("exports only the completed scan term", () => {
    const state = completeState();
    const payload = helpers.contributionPayload(state, "2026-08-24T18:00:00.000Z");

    expect(payload).toMatchObject({
      schemaVersion: 1,
      exportedAt: "2026-08-24T18:00:00.000Z",
      source: "Vergil course search via Columbia Catalog Chrome extension",
      scan: { termCode: "20263" },
    });
    expect(payload?.sections.map((value) => value.termCode)).toEqual(["20263"]);
    expect(helpers.contributionSummary(state)).toEqual({
      ready: true,
      reason: null,
      termCode: "20263",
      sections: 1,
      meetings: 1,
      locations: 1,
      observedFrom: observedAt,
      observedTo: observedAt,
    });
  });

  it("refuses passive, incomplete, quarantined, and count-mismatched captures", () => {
    expect(helpers.contributionPayload({ sections: {} })).toBeNull();

    for (const status of ["scanning", "quarantined", "error"]) {
      const state = completeState();
      state.scan.status = status;
      expect(helpers.contributionPayload(state)).toBeNull();
    }

    const mismatched = completeState();
    mismatched.scan.sectionsCaptured = 2;
    expect(helpers.contributionPayload(mismatched)).toBeNull();
    expect(helpers.contributionSummary(mismatched).reason).toContain("no longer matches");
  });
});
