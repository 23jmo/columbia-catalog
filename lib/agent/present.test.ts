import { describe, expect, it } from "vitest";

import type { Plan, Section } from "@/lib/types";

import { buildCampusMapArtifact, buildScheduleArtifact } from "./present";

function section(overrides: Partial<Section> = {}): Section {
  return {
    sectionId: "20263COMS4111W001",
    courseId: "COMS4111W",
    termCode: "20263",
    callNumber: "14501",
    sectionCode: "001",
    component: "LEC",
    methodOfInstruction: null,
    gradingMode: null,
    minUnit: 3,
    maxUnit: 3,
    instructors: ["Luis Gravano"],
    meetings: [
      {
        weekday: "Tu",
        startMinute: 790,
        endMinute: 865,
        buildingName: "Seeley W. Mudd Building",
        room: "833",
      },
      {
        weekday: "Th",
        startMinute: 790,
        endMinute: 865,
        buildingName: "Hamilton Hall",
        room: "517",
      },
    ],
    enrollmentCount: 10,
    enrollmentCap: 100,
    waitlistCount: null,
    waitlistCap: null,
    status: "open",
    sourceAsOf: "2026-08-22T00:00:00.000Z",
    lastSeenAt: null,
    detailUrl: null,
    note: null,
    openTo: null,
    ...overrides,
  };
}

const plan: Plan = {
  planId: "plan-1",
  userId: "user-1",
  termCode: "20263",
  name: "Fall draft",
  isPrimary: true,
  sectionIds: ["20263COMS4111W001"],
  customBlocks: [],
};

function deps(sections: Section[], plans: Plan[] = [plan]) {
  const byId = new Map(sections.map((row) => [row.sectionId, row]));
  return {
    catalog: {
      getSections: async (ids: string[]) =>
        ids.map((id) => byId.get(id)).filter((row): row is Section => Boolean(row)),
    },
    plans: {
      listPlans: async () => plans,
      getPlan: async (_userId: string, planId: string) =>
        plans.find((row) => row.planId === planId) ?? null,
    },
  };
}

describe("buildScheduleArtifact", () => {
  it("turns the primary plan into week-grid blocks", async () => {
    const artifact = await buildScheduleArtifact(deps([section()]), "user-1", {});
    expect(artifact.kind).toBe("schedule_card");
    expect(artifact.planName).toBe("Fall draft");
    expect(artifact.blocks.map((block) => block.weekday).sort()).toEqual(["Th", "Tu"]);
    expect(artifact.blocks.every((block) => block.tone === "plan")).toBe(true);
  });

  it("overlays extra section ids as candidates", async () => {
    const extra = section({
      sectionId: "20263MATH1201UN001",
      courseId: "MATH1201UN",
      sectionCode: "001",
      meetings: [
        {
          weekday: "Tu",
          startMinute: 600,
          endMinute: 675,
          buildingName: "Mathematics Building",
          room: "312",
        },
      ],
    });
    const artifact = await buildScheduleArtifact(deps([section(), extra]), "user-1", {
      sectionIds: [extra.sectionId],
    });
    const tones = new Set(artifact.blocks.map((block) => block.tone));
    expect(tones.has("plan")).toBe(true);
    expect(tones.has("candidate")).toBe(true);
  });

  it("narrows to one weekday when asked", async () => {
    const artifact = await buildScheduleArtifact(deps([section()]), "user-1", { weekday: "Tu" });
    expect(artifact.weekdays).toEqual(["Tu"]);
    expect(artifact.blocks.every((block) => block.weekday === "Tu")).toBe(true);
  });
});

describe("buildCampusMapArtifact", () => {
  it("collects buildings from the sections, without inventing a walk", async () => {
    const artifact = await buildCampusMapArtifact(deps([section()]), {
      sectionIds: ["20263COMS4111W001"],
    });
    expect(artifact.kind).toBe("campus_map_card");
    expect(artifact.connectStops).toBe(false);
    expect(artifact.buildingNames).toEqual(["Seeley W. Mudd Building", "Hamilton Hall"]);
  });

  it("draws Thursday as a route in meeting order", async () => {
    const artifact = await buildCampusMapArtifact(deps([section()]), {
      sectionIds: ["20263COMS4111W001"],
      weekday: "Th",
    });
    expect(artifact.connectStops).toBe(true);
    expect(artifact.weekday).toBe("Th");
    expect(artifact.routeStops?.[0]?.label).toContain("COMS 4111");
    expect(artifact.routeStops?.[0]?.highlighted).toBe(true);
  });
});
