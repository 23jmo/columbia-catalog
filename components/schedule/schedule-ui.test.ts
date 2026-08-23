/**
 * Schedule lane (UI) — adapter tests.
 *
 * Only `to-blocks.ts` is exercised: it holds the logic that is easy to get
 * silently wrong (lane assignment, tone marking, window expansion) while the
 * `.tsx` files are arrangement over its output.
 *
 * Relative imports throughout, so the suite resolves regardless of how the
 * runner is configured. Run with `npx vitest run components/schedule`.
 */

import { describe, expect, it } from "vitest";
import type { CustomBlock, Meeting, Section, Weekday } from "../../lib/types";
import type { PlannedMeeting } from "../course/contracts";
import { GRID_END_MINUTE, GRID_START_MINUTE } from "../../lib/constants";
import {
  blockIdFor,
  fitGridBounds,
  gridBounds,
  gridWeekdays,
  groupBlocksByWeekday,
  hourMarks,
  layoutDay,
  ownerIdOf,
  toWeekGridBlocks,
  type PositionedBlock,
} from "./to-blocks";
import type { WeekGridBlock } from "../course/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TERM = "20263";

function meeting(
  weekday: Weekday,
  startMinute: number,
  endMinute: number,
  buildingName: string | null = "Seeley W. Mudd Building",
  room: string | null = "833",
): Meeting {
  return { weekday, startMinute, endMinute, buildingName, room };
}

function section(courseId: string, sectionCode: string, meetings: Meeting[]): Section {
  return {
    sectionId: `${TERM}${courseId}${sectionCode}`,
    courseId,
    termCode: TERM,
    callNumber: "00000",
    sectionCode,
    component: "Lecture",
    methodOfInstruction: "In-person",
    gradingMode: null,
    minUnit: 3,
    maxUnit: 3,
    instructors: ["Jae Woo Lee"],
    meetings,
    enrollmentCount: 100,
    enrollmentCap: 120,
    waitlistCount: null,
    waitlistCap: null,
    status: "open",
    sourceAsOf: "2026-08-01T12:00:00Z",
    lastSeenAt: null,
    detailUrl: null,
    note: null,
    openTo: null,
  };
}

function customBlock(
  blockId: string,
  label: string,
  weekday: Weekday,
  startMinute: number,
  endMinute: number,
): CustomBlock {
  return { blockId, label, weekday, startMinute, endMinute };
}

function gridBlock(
  blockId: string,
  weekday: Weekday,
  startMinute: number,
  endMinute: number,
): WeekGridBlock {
  return {
    blockId: blockIdFor(blockId, weekday, startMinute),
    label: blockId,
    sublabel: null,
    weekday,
    startMinute,
    endMinute,
    tone: "plan",
  };
}

function toneOf(blocks: readonly WeekGridBlock[], ownerId: string): string[] {
  return blocks.filter((block) => ownerIdOf(block.blockId) === ownerId).map((block) => block.tone);
}

function laneOf(positioned: readonly PositionedBlock[], ownerId: string): PositionedBlock {
  const found = positioned.find((block) => ownerIdOf(block.blockId) === ownerId);
  if (!found) throw new Error(`No positioned block for ${ownerId}`);
  return found;
}

// ---------------------------------------------------------------------------
// Block identity
// ---------------------------------------------------------------------------

describe("block identity", () => {
  it("gives each meeting of one section its own rectangle id", () => {
    const twiceAWeek = section("COMS4118W", "001", [
      meeting("Mo", 610, 685),
      meeting("We", 610, 685),
    ]);
    const blocks = toWeekGridBlocks({ sections: [twiceAWeek] });

    expect(blocks).toHaveLength(2);
    expect(new Set(blocks.map((block) => block.blockId)).size).toBe(2);
    // ...while both still resolve back to the section that owns them.
    expect(blocks.map((block) => ownerIdOf(block.blockId))).toEqual([
      twiceAWeek.sectionId,
      twiceAWeek.sectionId,
    ]);
  });

  it("treats an id it did not mint as its own owner", () => {
    expect(ownerIdOf("hand-built")).toBe("hand-built");
  });
});

// ---------------------------------------------------------------------------
// Lane assignment
// ---------------------------------------------------------------------------

describe("layoutDay — overlap lane assignment", () => {
  it("keeps a non-overlapping day at full width", () => {
    const positioned = layoutDay([
      gridBlock("morning", "Mo", 540, 615),
      gridBlock("afternoon", "Mo", 780, 855),
    ]);

    expect(positioned.map((block) => block.laneCount)).toEqual([1, 1]);
    expect(positioned.map((block) => block.lane)).toEqual([0, 0]);
  });

  it("splits two overlapping meetings into side-by-side lanes", () => {
    const positioned = layoutDay([
      gridBlock("a", "Tu", 610, 685),
      gridBlock("b", "Tu", 640, 715),
    ]);

    expect(laneOf(positioned, "a").lane).toBe(0);
    expect(laneOf(positioned, "b").lane).toBe(1);
    expect(positioned.every((block) => block.laneCount === 2)).toBe(true);
  });

  it("gives a three-way collision three lanes", () => {
    const positioned = layoutDay([
      gridBlock("a", "We", 600, 720),
      gridBlock("b", "We", 610, 700),
      gridBlock("c", "We", 620, 690),
    ]);

    expect(new Set(positioned.map((block) => block.lane))).toEqual(new Set([0, 1, 2]));
    expect(positioned.every((block) => block.laneCount === 3)).toBe(true);
  });

  it("reuses a lane once its previous occupant has finished", () => {
    // `long` spans the whole cluster; `early` and `late` are disjoint from each
    // other, so they share lane 1 instead of forcing a third of the width.
    const positioned = layoutDay([
      gridBlock("long", "Th", 600, 780),
      gridBlock("early", "Th", 610, 660),
      gridBlock("late", "Th", 700, 760),
    ]);

    expect(laneOf(positioned, "long").lane).toBe(0);
    expect(laneOf(positioned, "early").lane).toBe(1);
    expect(laneOf(positioned, "late").lane).toBe(1);
    expect(positioned.every((block) => block.laneCount === 2)).toBe(true);
  });

  it("does not let a morning cluster narrow an unrelated afternoon cluster", () => {
    const positioned = layoutDay([
      gridBlock("am1", "Fr", 540, 600),
      gridBlock("am2", "Fr", 550, 610),
      gridBlock("pm", "Fr", 900, 960),
    ]);

    expect(laneOf(positioned, "am1").laneCount).toBe(2);
    expect(laneOf(positioned, "pm").laneCount).toBe(1);
  });

  it("drops a zero-length rectangle rather than drawing a hairline", () => {
    expect(layoutDay([gridBlock("empty", "Mo", 600, 600)])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Conflict tone
// ---------------------------------------------------------------------------

describe("toWeekGridBlocks — conflict tone", () => {
  it("leaves a clean plan entirely in the plan tone", () => {
    const blocks = toWeekGridBlocks({
      sections: [
        section("COMS4118W", "001", [meeting("Mo", 610, 685)]),
        section("COMS4111W", "001", [meeting("Mo", 700, 775)]),
      ],
    });

    expect(blocks.every((block) => block.tone === "plan")).toBe(true);
  });

  it("paints both ends of a candidate/plan collision as conflicts", () => {
    const planned = section("COMS4118W", "001", [meeting("Mo", 610, 685)]);
    const candidate = section("COMS4995W", "002", [meeting("Mo", 640, 715)]);

    const blocks = toWeekGridBlocks({
      sections: [planned],
      candidateSections: [candidate],
    });

    expect(toneOf(blocks, planned.sectionId)).toEqual(["conflict"]);
    expect(toneOf(blocks, candidate.sectionId)).toEqual(["conflict"]);
  });

  it("keeps a candidate that fits as a candidate", () => {
    const planned = section("COMS4118W", "001", [meeting("Mo", 610, 685)]);
    const candidate = section("COMS4995W", "002", [meeting("Mo", 700, 775)]);

    const blocks = toWeekGridBlocks({
      sections: [planned],
      candidateSections: [candidate],
    });

    expect(toneOf(blocks, planned.sectionId)).toEqual(["plan"]);
    expect(toneOf(blocks, candidate.sectionId)).toEqual(["candidate"]);
  });

  it("flags a candidate that duplicates a course already in the plan, even at a clean hour", () => {
    const planned = section("COMS4118W", "001", [meeting("Mo", 610, 685)]);
    const otherSection = section("COMS4118W", "002", [meeting("Tu", 900, 975)]);

    const blocks = toWeekGridBlocks({
      sections: [planned],
      candidateSections: [otherSection],
    });

    expect(toneOf(blocks, planned.sectionId)).toEqual(["conflict"]);
    expect(toneOf(blocks, otherSection.sectionId)).toEqual(["conflict"]);
  });

  it("marks only the colliding day when a section meets twice a week", () => {
    const planned = section("COMS4118W", "001", [
      meeting("Mo", 610, 685),
      meeting("We", 610, 685),
    ]);
    // A one-day candidate can only clash on Monday.
    const candidate = section("COMS4995W", "002", [meeting("Mo", 640, 715)]);

    const blocks = toWeekGridBlocks({ sections: [planned], candidateSections: [candidate] });
    const wednesday = blocks.find((block) => block.weekday === "We");

    // The section id is conflicted, so both of its rectangles carry the tone —
    // the student has to resolve it, and hiding half of it would be misleading.
    expect(wednesday?.tone).toBe("conflict");
  });
});

// ---------------------------------------------------------------------------
// Custom blocks
// ---------------------------------------------------------------------------

describe("custom blocks", () => {
  it("draws a non-course commitment with its own label and no room line", () => {
    const blocks = toWeekGridBlocks({
      customBlocks: [customBlock("work", "Work", "Tu", 900, 1080)],
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      label: "Work",
      sublabel: null,
      weekday: "Tu",
      startMinute: 900,
      endMinute: 1080,
      tone: "plan",
    });
  });

  it("lets a custom block conflict a section — spec §8, blocks are full participants", () => {
    const lecture = section("COMS4118W", "001", [meeting("Tu", 950, 1025)]);
    const blocks = toWeekGridBlocks({
      sections: [lecture],
      customBlocks: [customBlock("work", "Work", "Tu", 900, 1080)],
    });

    expect(toneOf(blocks, lecture.sectionId)).toEqual(["conflict"]);
    expect(toneOf(blocks, "work")).toEqual(["conflict"]);
  });

  it("does not flag two personal commitments overlapping a section-free hour", () => {
    const lecture = section("COMS4118W", "001", [meeting("We", 610, 685)]);
    const blocks = toWeekGridBlocks({
      sections: [lecture],
      customBlocks: [customBlock("gym", "Gym", "We", 1080, 1140)],
    });

    expect(blocks.every((block) => block.tone === "plan")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Planned meetings (the drawer's PrimaryPlanSnapshot shape)
// ---------------------------------------------------------------------------

describe("planned meetings", () => {
  const plannedLecture: PlannedMeeting = {
    ownerId: "20263COMS4118W001",
    label: "COMS 4118 · 001",
    courseId: "COMS4118W",
    weekday: "Mo",
    startMinute: 610,
    endMinute: 685,
    buildingName: "Seeley W. Mudd Building",
    campusZone: "morningside",
  };

  it("keeps the caller's own label rather than re-deriving one", () => {
    const blocks = toWeekGridBlocks({ plannedMeetings: [plannedLecture] });
    expect(blocks[0].label).toBe("COMS 4118 · 001");
    expect(blocks[0].sublabel).toBe("Seeley W. Mudd Building");
  });

  it("conflicts a candidate section against a snapshot meeting", () => {
    const candidate = section("COMS4995W", "002", [meeting("Mo", 640, 715)]);
    const blocks = toWeekGridBlocks({
      plannedMeetings: [plannedLecture],
      candidateSections: [candidate],
    });

    expect(toneOf(blocks, plannedLecture.ownerId)).toEqual(["conflict"]);
    expect(toneOf(blocks, candidate.sectionId)).toEqual(["conflict"]);
  });

  it("treats a courseId-less planned meeting as a custom block", () => {
    const shift: PlannedMeeting = {
      ownerId: "work",
      label: "Work",
      courseId: null,
      weekday: "Th",
      startMinute: 900,
      endMinute: 1080,
      buildingName: null,
      campusZone: "unknown",
    };
    const lecture = section("COMS4118W", "001", [meeting("Th", 950, 1025)]);

    const blocks = toWeekGridBlocks({ plannedMeetings: [shift], sections: [lecture] });

    expect(toneOf(blocks, "work")).toEqual(["conflict"]);
    expect(toneOf(blocks, lecture.sectionId)).toEqual(["conflict"]);
  });
});

// ---------------------------------------------------------------------------
// Window bounds
// ---------------------------------------------------------------------------

describe("gridBounds — out-of-bounds expansion", () => {
  it("uses the shared defaults when everything fits", () => {
    const blocks = toWeekGridBlocks({
      sections: [section("COMS4118W", "001", [meeting("Mo", 610, 685)])],
    });

    expect(gridBounds(blocks)).toEqual({
      startMinute: GRID_START_MINUTE,
      endMinute: GRID_END_MINUTE,
    });
  });

  it("opens the top of the window for an early meeting, snapped to the hour", () => {
    const early = toWeekGridBlocks({
      sections: [section("MUSI1002W", "001", [meeting("Mo", 7 * 60 + 40, 8 * 60 + 55)])],
    });

    expect(gridBounds(early).startMinute).toBe(7 * 60);
  });

  it("opens the bottom of the window for a late meeting, snapped to the hour", () => {
    const late = toWeekGridBlocks({
      sections: [section("FILM3000W", "001", [meeting("We", 22 * 60, 23 * 60 + 30)])],
    });

    expect(gridBounds(late).endMinute).toBe(24 * 60);
  });

  it("never clips: every block sits inside the returned window", () => {
    const blocks = toWeekGridBlocks({
      sections: [section("EARL1600W", "001", [meeting("Fr", 6 * 60 + 15, 7 * 60 + 30)])],
      customBlocks: [customBlock("night", "Night shift", "Fr", 23 * 60, 23 * 60 + 45)],
    });
    const bounds = gridBounds(blocks);

    for (const block of blocks) {
      expect(block.startMinute).toBeGreaterThanOrEqual(bounds.startMinute);
      expect(block.endMinute).toBeLessThanOrEqual(bounds.endMinute);
    }
  });

  it("survives an inverted window a caller hands it", () => {
    const bounds = gridBounds([], 20 * 60, 8 * 60);
    expect(bounds.endMinute).toBeGreaterThan(bounds.startMinute);
  });
});

describe("fitGridBounds — reclaiming empty canvas", () => {
  it("contracts to an afternoon plan instead of ruling the whole day", () => {
    // 4:10pm–5:25pm on the default 8am–10pm canvas left ~two thirds of the
    // grid empty and squeezed the real block into an unreadable band.
    const blocks = toWeekGridBlocks({
      sections: [section("COMS3157W", "001", [meeting("Mo", 16 * 60 + 10, 17 * 60 + 25)])],
    });
    const bounds = fitGridBounds(blocks);

    expect(bounds.startMinute).toBeGreaterThan(GRID_START_MINUTE);
    expect(bounds.endMinute).toBeLessThan(GRID_END_MINUTE);
    expect(bounds.endMinute - bounds.startMinute).toBeLessThan(
      GRID_END_MINUTE - GRID_START_MINUTE,
    );
  });

  it("still never clips — every block sits inside the fitted window", () => {
    const blocks = toWeekGridBlocks({
      sections: [
        section("COMS3157W", "001", [meeting("Mo", 16 * 60 + 10, 17 * 60 + 25)]),
        section("COMS4118W", "001", [meeting("Tu", 18 * 60 + 10, 20 * 60 + 40)]),
      ],
      customBlocks: [customBlock("lab", "Lab shift", "Fr", 9 * 60, 13 * 60)],
    });
    const bounds = fitGridBounds(blocks);

    for (const block of blocks) {
      expect(block.startMinute).toBeGreaterThanOrEqual(bounds.startMinute);
      expect(block.endMinute).toBeLessThanOrEqual(bounds.endMinute);
    }
  });

  it("keeps a meeting outside the default window visible", () => {
    // Fitting must never undo gridBounds' expansion.
    const early = toWeekGridBlocks({
      sections: [section("MUSI1002W", "001", [meeting("Mo", 6 * 60 + 40, 7 * 60 + 55)])],
    });
    const bounds = fitGridBounds(early);

    expect(bounds.startMinute).toBeLessThanOrEqual(6 * 60 + 40);
    expect(bounds.endMinute).toBeGreaterThanOrEqual(7 * 60 + 55);
  });

  it("never collapses below a six-hour span for a single short class", () => {
    const blocks = toWeekGridBlocks({
      sections: [section("COMS3157W", "001", [meeting("Mo", 13 * 60, 13 * 60 + 50)])],
    });
    const bounds = fitGridBounds(blocks);

    expect(bounds.endMinute - bounds.startMinute).toBeGreaterThanOrEqual(6 * 60);
  });

  it("falls back to the full default canvas when there is nothing to fit", () => {
    expect(fitGridBounds([])).toEqual({
      startMinute: GRID_START_MINUTE,
      endMinute: GRID_END_MINUTE,
    });
  });

  it("ignores zero-length blocks when measuring the used range", () => {
    const blocks = toWeekGridBlocks({
      sections: [section("COMS3157W", "001", [meeting("Mo", 16 * 60, 17 * 60)])],
      customBlocks: [customBlock("noop", "Zero", "Mo", 9 * 60, 9 * 60)],
    });
    const bounds = fitGridBounds(blocks);

    expect(bounds.startMinute).toBeGreaterThan(GRID_START_MINUTE);
  });

  it("marks the hour that opens each band, and not the closing edge", () => {
    const marks = hourMarks({ startMinute: 8 * 60, endMinute: 11 * 60 });
    expect(marks).toEqual([8 * 60, 9 * 60, 10 * 60]);
  });

  it("starts marks at the first whole hour inside a ragged window", () => {
    expect(hourMarks({ startMinute: 7 * 60 + 40, endMinute: 10 * 60 })).toEqual([
      8 * 60,
      9 * 60,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Weekend meetings
// ---------------------------------------------------------------------------

describe("weekend meetings", () => {
  it("grows a Saturday column instead of dropping the meeting", () => {
    const blocks = toWeekGridBlocks({
      sections: [section("MDES1210W", "001", [meeting("Sa", 600, 720)])],
    });

    expect(blocks).toHaveLength(1);
    expect(gridWeekdays(blocks)).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa"]);
  });

  it("places the weekend after Friday, not before Monday", () => {
    const blocks = toWeekGridBlocks({
      sections: [section("MDES1210W", "001", [meeting("Su", 600, 720)])],
      customBlocks: [customBlock("brunch", "Brunch", "Sa", 720, 780)],
    });

    expect(gridWeekdays(blocks)).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
    expect(groupBlocksByWeekday(blocks).map((day) => day.weekday)).toEqual(["Sa", "Su"]);
  });

  it("still shows the weekday base when nothing meets at all", () => {
    expect(gridWeekdays([])).toEqual(["Mo", "Tu", "We", "Th", "Fr"]);
  });

  it("lays out a weekend clash side by side like any other day", () => {
    const blocks = toWeekGridBlocks({
      customBlocks: [
        customBlock("lab", "Open lab", "Sa", 600, 720),
        customBlock("study", "Study group", "Sa", 660, 780),
      ],
    });
    const positioned = layoutDay(blocks.filter((block) => block.weekday === "Sa"));

    expect(positioned.every((block) => block.laneCount === 2)).toBe(true);
  });
});
