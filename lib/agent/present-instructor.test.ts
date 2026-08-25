import { describe, expect, it } from "vitest";

import type { InstructorPageData } from "@/lib/data/instructors";

import { buildInstructorArtifact } from "./present-instructor";

function profile(overrides: Partial<InstructorPageData> = {}): InstructorPageData {
  return {
    name: "Adam H Cannon",
    slug: "adam-h-cannon",
    termCode: "20263",
    termLabel: "Fall 2026",
    subjects: ["COMS"],
    departments: ["Computer Science"],
    courses: [
      {
        courseId: "COMS1004W",
        subjectCode: "COMS",
        code: "COMS 1004",
        title: "Intro to Java",
        credits: "3",
        department: "Computer Science",
        sections: [],
        enrolled: 100,
        capacity: 200,
      },
    ],
    courseCount: 1,
    sectionCount: 2,
    studentsTaught: 100,
    totalCapacity: 200,
    fillRatio: 0.5,
    seatsAsOf: null,
    weeklyMinutes: 150,
    teachingDays: ["Tu", "Th"],
    buildings: ["Mudd"],
    largestSection: null,
    coTeachers: [],
    bounds: { startsOn: "2026-09-08", endsOn: "2026-12-14" },
    calendar: [],
    months: [],
    weekLoad: [],
    peakLoad: null,
    ...overrides,
  } as InstructorPageData;
}

describe("buildInstructorArtifact", () => {
  it("returns the compact card the thread renders", async () => {
    const artifact = await buildInstructorArtifact(
      {
        loadProfile: async () => profile(),
        loadReputation: async () => null,
      },
      { name: "Adam H Cannon" },
    );
    expect(artifact.found).toBe(true);
    expect(artifact.slug).toBe("adam-h-cannon");
    expect(artifact.courses[0]?.code).toBe("COMS 1004");
  });

  it("refuses Staff/TBA rather than looking them up", async () => {
    let called = false;
    const artifact = await buildInstructorArtifact(
      {
        loadProfile: async () => {
          called = true;
          return profile();
        },
        loadReputation: async () => null,
      },
      { name: "Staff" },
    );
    expect(called).toBe(false);
    expect(artifact.found).toBe(false);
  });

  it("marks an unknown name as not found", async () => {
    const artifact = await buildInstructorArtifact(
      {
        loadProfile: async () => null,
        loadReputation: async () => null,
      },
      { name: "Nobody Here" },
    );
    expect(artifact.found).toBe(false);
    expect(artifact.error).toMatch(/No one by that name/);
  });
});
