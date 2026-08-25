import { describe, expect, it } from "vitest";

import { VERGIL_SOURCE, VergilContributionRequestSchema } from "./contracts";

const section = {
  sectionKey: "20263COMS4113W001",
  termCode: "20263",
  courseId: "COMS4113W",
  sectionCode: "001",
  callNumber: "12345",
  meetings: [
    {
      weekday: "Mo" as const,
      startMinute: 600,
      endMinute: 675,
      buildingName: "Mudd",
      room: "833",
    },
  ],
  observedAt: "2026-08-24T17:28:00.000Z",
  provenance: "Vergil course search" as const,
};

describe("Vergil contribution request validation", () => {
  it("accepts a strict sanitized section chunk", () => {
    expect(
      VergilContributionRequestSchema.safeParse({
        action: "chunk",
        contributionId: "417d3e53-8414-45d6-a66f-8ac531e906c3",
        sections: [section],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate natural meeting keys", () => {
    const duplicate = {
      ...section,
      meetings: [section.meetings[0], { ...section.meetings[0], buildingName: "Hamilton" }],
    };
    expect(
      VergilContributionRequestSchema.safeParse({
        action: "chunk",
        contributionId: "417d3e53-8414-45d6-a66f-8ac531e906c3",
        sections: [duplicate],
      }).success,
    ).toBe(false);
  });

  it("rejects a completed-scan header whose section totals disagree", () => {
    expect(
      VergilContributionRequestSchema.safeParse({
        action: "start",
        payloadHash: "a".repeat(64),
        schemaVersion: 1,
        source: VERGIL_SOURCE,
        exportedAt: "2026-08-24T17:32:00.000Z",
        termCode: "20263",
        sections: 2,
        meetings: 1,
        locations: 1,
        observedFrom: "2026-08-24T17:28:00.000Z",
        observedTo: "2026-08-24T17:28:00.000Z",
        scan: {
          status: "complete",
          termCode: "20263",
          page: 52,
          pages: 52,
          scannedCourses: 5195,
          totalCourses: 5195,
          startedAt: "2026-08-24T17:27:00.000Z",
          completedAt: "2026-08-24T17:30:00.000Z",
          error: null,
          baselineSectionCount: 143,
          sectionsCaptured: 1,
        },
      }).success,
    ).toBe(false);
  });
});

